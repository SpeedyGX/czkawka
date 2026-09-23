// File actions: single/bulk hardlinking and deletion.

import { filename } from './util.js';
import { state } from './store.js';
import { api } from './api.js';
import { toast, confirmAction } from './ui.js';
import { renderResults, clearResults, detectHardlinks } from './results.js';

function fileOf(path) {
    for (const group of state.groups) {
        for (const file of group.files || []) {
            if (file.path === path) return file;
        }
    }
    return null;
}

function inodeOf(path) {
    return fileOf(path)?.inode || 0;
}

// Reconcile group-index-keyed view state after a change to state.groups, then
// re-render. `mutate` receives the current groups and must return an array of
// the same length/order, using an empty `files` list to mark a group for
// removal. Removed groups drop their sourceMap entry, and the flat-index
// selection plus cached snapshot are reset so nothing points at a stale group.
function commitGroupChange(mutate, { clearWhenEmpty = false, adjustPage = false } = {}) {
    const mutated = mutate(state.groups);

    const kept = [];
    const indexMap = new Map();
    mutated.forEach((group, oldIdx) => {
        if ((group.files || []).length === 0) return;
        indexMap.set(oldIdx, kept.length);
        kept.push(group);
    });

    const sourceMap = {};
    for (const [oldIdx, path] of Object.entries(state.sourceMap)) {
        const newIdx = indexMap.get(Number(oldIdx));
        if (newIdx !== undefined) sourceMap[newIdx] = path;
    }

    state.groups = kept;
    state.sourceMap = sourceMap;
    // Selection holds flat indices into the recomputed fileIndex, so it would
    // point at the wrong files after removal — start from a clean slate.
    state.selection = new Set();
    // Keep the per-tool snapshot in sync; a stale copy would resurrect removed
    // groups when switching tools back.
    const cached = state.resultsCache[state.activeToolId];
    if (cached) {
        cached.summary = state.summary;
        cached.groups = state.groups;
        cached.sourceMap = { ...state.sourceMap };
    }

    const totalFiles = state.groups.reduce((sum, group) => sum + (group.files || []).length, 0);
    if (state.summary) {
        state.summary.groups = state.groups.length;
        state.summary.files = totalFiles;
    }

    if (clearWhenEmpty && totalFiles === 0) {
        clearResults();
        return totalFiles;
    }
    if (adjustPage && state.currentPage > 1 && totalFiles <= (state.currentPage - 1) * state.pageSize) {
        state.currentPage--;
    }
    renderResults();
    return totalFiles;
}

// The hardlink endpoint reports aggregate counts only (no per-pair outcome), so
// once at least one hardlink succeeded every submitted pair is mirrored onto the
// in-memory model: a real hardlink shares the source's inode and the rows show it.
function applyHardlinkResults(pairs, result) {
    if (result.hardlinked > 0) {
        for (const { sourceInode, target } of pairs) {
            if (!sourceInode) continue;
            const file = fileOf(target);
            if (file) file.inode = sourceInode;
        }
    }

    detectHardlinks();
    // A hardlink never drops a group: a fully linked group stays listed (the
    // "Hide linked" filter hides it) so "Linked only" still shows what was just
    // linked. This call only reconciles selection/cache and re-renders.
    commitGroupChange((groups) => groups);
}

export async function hardlinkOne({ source, target }) {
    if (!source) {
        toast('Set a source file first', 'warning');
        return;
    }

    const sourceInode = inodeOf(source);

    const ok = await confirmAction({
        title: 'Create hardlink?',
        message: `Source: ${filename(source)}\nTarget: ${filename(target)}`,
        confirmText: 'Hardlink',
    });
    if (!ok) return;

    try {
        const result = await api.hardlink([source], [target]);
        if (result.hardlinked > 0) {
            applyHardlinkResults([{ source, sourceInode, target }], result);
            toast(`Hardlinked ${filename(target)}`, 'success');
        } else if (result.skipped > 0) {
            toast(`Skipped ${filename(target)}: target already exists`, 'warning');
        } else {
            toast(`Failed: ${(result.errors || ['unknown error']).join(', ')}`, 'error');
        }
    } catch (err) {
        toast(`Hardlink error: ${err.message}`, 'error');
    }
}

export async function hardlinkSelected() {
    const selected = [...state.selection];
    if (selected.length === 0) {
        toast('No files selected', 'warning');
        return;
    }

    const byGroup = new Map();
    for (const idx of selected) {
        const file = state.fileIndex[idx];
        if (!file) continue;
        const groupIdx = state.groups.findIndex((group) => (group.files || []).includes(file));
        if (groupIdx === -1) continue;
        if (!byGroup.has(groupIdx)) byGroup.set(groupIdx, []);
        byGroup.get(groupIdx).push(file.path);
    }

    if (byGroup.size === 0) {
        toast('No files selected', 'warning');
        return;
    }

    const pairs = [];
    for (const [groupIdx, paths] of byGroup) {
        const source = state.sourceMap[groupIdx];
        if (!source) {
            toast(`Group ${groupIdx + 1}: set a source file first`, 'warning');
            return;
        }

        const sourceInode = inodeOf(source);
        for (const path of paths) {
            if (path === source) continue;
            const targetInode = inodeOf(path);
            if (sourceInode !== 0 && targetInode !== 0 && targetInode === sourceInode) continue;
            pairs.push({ source, sourceInode, target: path });
        }
    }

    if (pairs.length === 0) {
        toast('Nothing to hardlink', 'warning');
        return;
    }

    const ok = await confirmAction({
        title: 'Create hardlinks?',
        message: `Hardlink ${pairs.length} file(s) across ${byGroup.size} group(s)?`,
        confirmText: 'Hardlink',
    });
    if (!ok) return;

    try {
        const result = await api.hardlink(pairs.map((pair) => pair.source), pairs.map((pair) => pair.target));
        const type = result.failed > 0 ? 'warning' : 'success';
        toast(`Hardlinked ${result.hardlinked}, skipped ${result.skipped}, failed ${result.failed}`, type);

        if (result.hardlinked > 0) {
            applyHardlinkResults(pairs, result);
        } else if (result.skipped > 0) {
            renderResults();
        }
    } catch (err) {
        toast(`Hardlink error: ${err.message}`, 'error');
    }
}

export async function deleteSelected() {
    const paths = [...state.selection]
        .map((idx) => state.fileIndex[idx]?.path)
        .filter(Boolean);

    if (paths.length === 0) {
        toast('No files selected', 'warning');
        return;
    }

    const ok = await confirmAction({
        title: 'Delete files?',
        message: `Delete ${paths.length} file(s)?\n\n${paths.map(filename).join('\n')}`,
        confirmText: 'Delete',
        danger: true,
    });
    if (!ok) return;

    try {
        const result = await api.deleteFiles(state.scanId, paths);
        toast(`Deleted ${result.deleted}, failed ${result.failed}`, result.failed > 0 ? 'warning' : 'success');

        const removed = new Set(paths);
        commitGroupChange(
            (groups) => groups.map((group) => ({ ...group, files: (group.files || []).filter((file) => !removed.has(file.path)) })),
            { clearWhenEmpty: true, adjustPage: true }
        );
    } catch (err) {
        toast(`Delete error: ${err.message}`, 'error');
    }
}
