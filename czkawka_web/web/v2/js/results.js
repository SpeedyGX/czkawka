// Results rendering: grouped table + gallery, sorting, pagination and selection.

import { $, el, emit, formatSize, formatDate, formatDuration, filename } from './util.js';
import { state, resetViewState } from './store.js';
import { api } from './api.js';
import { openTarget, openWithSystem } from './open.js';
import { toast } from './ui.js';

const RESULT_TOOL = {
    duplicates: 'duplicates',
    images: 'similar-images',
    videos: 'similar-videos',
    'similar-images': 'similar-images',
    'similar-videos': 'similar-videos',
};

const SORT_COLUMNS = {
    duplicates: [
        { key: 'path', label: 'Path', getValue: (f) => (f.path || '').toLowerCase() },
        { key: 'size', label: 'Size', getValue: (f) => f.size || 0 },
        { key: 'modified', label: 'Modified', getValue: (f) => f.modified_date || 0 },
    ],
    'similar-images': [
        { key: 'path', label: 'Path', getValue: (f) => (f.path || '').toLowerCase() },
        { key: 'similarity', label: 'Diff', getValue: (f) => f.similarity ?? 0 },
        { key: 'resolution', label: 'Resolution', getValue: (f) => (f.width || 0) * (f.height || 0) },
        { key: 'size', label: 'Size', getValue: (f) => f.size || 0 },
    ],
    'similar-videos': [
        { key: 'path', label: 'Path', getValue: (f) => (f.path || '').toLowerCase() },
        { key: 'similarity', label: 'Diff', getValue: (f) => f.similarity ?? 0 },
        { key: 'duration', label: 'Duration', getValue: (f) => f.duration || 0 },
        { key: 'codec', label: 'Codec', getValue: (f) => (f.codec || '').toLowerCase() },
        { key: 'fps', label: 'FPS', getValue: (f) => f.fps ?? 0 },
        { key: 'resolution', label: 'Resolution', getValue: (f) => (f.width || 0) * (f.height || 0) },
        { key: 'size', label: 'Size', getValue: (f) => f.size || 0 },
    ],
};

function resultTool() {
    return RESULT_TOOL[state.tool] || RESULT_TOOL[state.activeToolId] || 'duplicates';
}

// --- Open helpers -----------------------------------------------------

function activateOnKey(event, handler) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handler();
    }
}

async function openPath(path, mode = 'file') {
    let result;
    if (mode === 'folder') {
        try {
            const response = await openWithSystem(path, 'folder');
            result = { opened: Boolean(response?.opened), error: response?.error || null };
        } catch (err) {
            result = { opened: false, error: err.message };
        }
    } else {
        result = await openTarget(path);
    }
    if (!result.opened && result.error) toast(result.error, 'error', 8000);
}

// --- Hardlink detection ----------------------------------------------

export function detectHardlinks() {
    state.linkedPaths = new Set();
    for (const group of state.groups) {
        const seen = new Map();
        for (const file of group.files || []) {
            const inode = file.inode;
            if (!inode) continue;
            if (seen.has(inode)) {
                state.linkedPaths.add(file.path);
                state.linkedPaths.add(seen.get(inode));
            } else {
                seen.set(inode, file.path);
            }
        }
    }
}

// --- Panel visibility -------------------------------------------------

export function showResults() {
    $('#empty-state').hidden = true;
    $('#table-wrap').hidden = false;
    renderResults();
}

export function clearResults() {
    resetViewState();
    state.summary = null;
    state.groups = [];
    state.tool = null;
    state.mode = null;
    state.linkedPaths = new Set();

    $('#results-summary').textContent = '';
    $('#results-toolbar').replaceChildren();
    $('#results-header').replaceChildren();
    $('#results-body').replaceChildren();
    $('#pagination').replaceChildren();
    $('#gallery-view').replaceChildren();
    $('#gallery-view').hidden = true;
    $('#table-wrap').hidden = true;
    $('#empty-state').hidden = false;
}

// --- Header -----------------------------------------------------------

function sortableTh(label, key, tool) {
    const active = state.sortColumn === key;
    const th = el('th', { class: `sortable${active ? ' sorted' : ''}`, dataset: { sortKey: key } }, [
        label,
        el('span', { class: 'sort-arrow', text: active ? (state.sortDirection === 'asc' ? '\u25B2' : '\u25BC') : '' }),
    ]);
    th.setAttribute('aria-sort', active ? (state.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none');
    th.setAttribute('scope', 'col');
    return th;
}

function buildHeader(tool) {
    const row = el('tr', {}, [
        el('th', { class: 'cell-check', scope: 'col' }, [
            el('input', { type: 'checkbox', id: 'select-all', 'aria-label': 'Select all files on this page' }),
        ]),
    ]);

    row.append(sortableTh('Path', 'path', tool));

    if (tool === 'similar-images') {
        row.append(el('th', { scope: 'col', text: 'Inode' }));
        for (const [key, label] of [['similarity', 'Diff'], ['resolution', 'Resolution'], ['size', 'Size']]) {
            row.append(sortableTh(label, key, tool));
        }
    } else if (tool === 'similar-videos') {
        row.append(el('th', { scope: 'col', text: 'Inode' }));
        for (const [key, label] of [['similarity', 'Diff'], ['duration', 'Duration'], ['codec', 'Codec'], ['fps', 'FPS'], ['resolution', 'Resolution'], ['size', 'Size']]) {
            row.append(sortableTh(label, key, tool));
        }
    } else {
        row.append(el('th', { scope: 'col', text: 'Inode' }));
        row.append(sortableTh('Size', 'size', tool));
        row.append(sortableTh('Modified', 'modified', tool));
        if (state.checkingMethod === 'Hash') row.append(el('th', { scope: 'col', text: 'Hash' }));
    }

    row.append(el('th', { scope: 'col', text: 'Action' }));
    return row;
}

// --- Rows -------------------------------------------------------------

function pathCell(path, linkedTag, thumbUrl) {
    const children = [];
    const open = () => openPath(path);

    if (thumbUrl) {
        const img = el('img', { class: 'thumb', alt: '', loading: 'lazy', title: 'Open', role: 'button', tabindex: '0' });
        img.src = thumbUrl;
        img.addEventListener('click', open);
        img.addEventListener('keydown', (event) => activateOnKey(event, open));
        children.push(img);
    }

    const text = el('span', {
        class: 'path-text path-clickable',
        title: 'Open',
        text: path,
        role: 'button',
        tabindex: '0',
    });
    text.addEventListener('click', open);
    text.addEventListener('keydown', (event) => activateOnKey(event, open));
    children.push(text);

    if (linkedTag) children.push(el('span', { class: 'badge-linked', text: 'Linked' }));
    return el('td', {}, [el('div', { class: 'path-cell' }, children)]);
}

function actionCell(file, groupIdx, isSource, hasSource, isLinked) {
    const path = file.path || '';
    const buttons = [
        el('button', {
            class: 'mini-btn',
            type: 'button',
            text: 'Open',
            'aria-label': `Open ${filename(path)}`,
            onClick: () => openPath(path),
        }),
        el('button', {
            class: 'mini-btn',
            type: 'button',
            text: 'Show in folder',
            'aria-label': `Show ${filename(path)} in folder`,
            onClick: () => openPath(path, 'folder'),
        }),
    ];

    if (isSource) {
        buttons.push(el('button', {
            class: 'mini-btn is-source',
            type: 'button',
            text: '\u2605 Source',
            'aria-label': `Remove ${filename(path)} as hardlink source`,
            dataset: { action: 'clear-source', group: String(groupIdx), path },
        }));
    } else if (hasSource && !isLinked) {
        buttons.push(el('button', {
            class: 'mini-btn is-link',
            type: 'button',
            text: 'Hardlink',
            'aria-label': `Hardlink ${filename(path)} to source`,
            dataset: { action: 'hardlink', group: String(groupIdx), path },
        }));
    } else {
        buttons.push(el('button', {
            class: 'mini-btn',
            type: 'button',
            text: 'Set source',
            'aria-label': `Set ${filename(path)} as hardlink source`,
            dataset: { action: 'set-source', group: String(groupIdx), path },
        }));
    }

    return el('td', { class: 'cell-actions' }, [el('div', { class: 'row-actions' }, buttons)]);
}

function buildFileRow(file, groupIdx, idx, tool) {
    const path = file.path || '';
    const isLinked = state.linkedPaths.has(path);
    const groupSource = state.sourceMap[groupIdx];
    const isSource = groupSource === path;

    // Any file sharing an inode with another file in the group is "linked" — even
    // the source. A row can be both source-highlighted and faded at the same time.
    const row = el('tr', {
        class: `${isSource ? 'source-row' : 'file-row'}${isLinked ? ' row-linked' : ''}`,
        dataset: { group: String(groupIdx), fileIdx: String(idx) },
    });

    const checkbox = el('input', { type: 'checkbox', 'aria-label': `Select ${filename(path)}` });
    checkbox.checked = state.selection.has(idx);
    checkbox.dataset.fileIdx = String(idx);
    row.append(el('td', { class: 'cell-check' }, [checkbox]));

    if (tool === 'similar-images') {
        const width = file.width || 0;
        const height = file.height || 0;
        const resolution = width && height ? `${width}\u00D7${height}` : '\u2014';
        row.append(pathCell(path, isLinked, api.imagePreviewUrl(path)));
        row.append(el('td', { class: 'cell-num', text: String(file.inode || '\u2014') }));
        row.append(el('td', { class: 'cell-num', text: `${file.similarity ?? 0}%` }));
        row.append(el('td', { text: resolution }));
        row.append(el('td', { class: 'cell-num', text: formatSize(file.size || 0) }));
    } else if (tool === 'similar-videos') {
        const width = file.width || 0;
        const height = file.height || 0;
        const resolution = width && height ? `${width}\u00D7${height}` : '\u2014';
        const fps = file.fps != null ? file.fps.toFixed(1) : '\u2014';
        // Audio-fingerprint rows report difference 0, which is not a visual similarity.
        const diff = state.mode === 'audio' ? '\u2014' : `${file.similarity ?? 0}%`;
        const thumbUrl = file.thumbnail_path ? api.videoPreviewUrl(file.thumbnail_path) : null;

        row.append(pathCell(path, isLinked, thumbUrl));
        row.append(el('td', { class: 'cell-num', text: String(file.inode || '\u2014') }));
        row.append(el('td', { class: 'cell-num', text: diff }));
        row.append(el('td', { text: formatDuration(file.duration || 0) }));
        row.append(el('td', { text: file.codec || '\u2014' }));
        row.append(el('td', { text: fps }));
        row.append(el('td', { text: resolution }));
        row.append(el('td', { class: 'cell-num', text: formatSize(file.size || 0) }));
    } else {
        row.append(pathCell(path, isLinked, null));
        row.append(el('td', { class: 'cell-num', text: String(file.inode || '\u2014') }));
        row.append(el('td', { class: 'cell-num', text: formatSize(file.size || 0) }));
        row.append(el('td', { text: formatDate(file.modified_date || 0) }));
        if (state.checkingMethod === 'Hash') {
            row.append(el('td', { class: 'mono', text: String(file.hash || '').substring(0, 12) }));
        }
    }

    row.append(actionCell(file, groupIdx, isSource, Boolean(groupSource), isLinked));
    return row;
}

// --- Toolbar ----------------------------------------------------------

const LINKED_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'hide', label: 'Hide linked' },
    { value: 'only', label: 'Linked only' },
];

function buildLinkedFilter() {
    return el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Linked files filter' },
        LINKED_FILTERS.map(({ value, label }) => el('button', {
            class: `seg-btn${state.linkedFilter === value ? ' active' : ''}`,
            type: 'button',
            role: 'radio',
            text: label,
            'aria-checked': String(state.linkedFilter === value),
            onClick: () => setLinkedFilter(value),
        })));
}

function setLinkedFilter(value) {
    state.linkedFilter = value;
    state.currentPage = 1;
    renderResults();
}

function buildToolbar(tool) {
    const toolbar = $('#results-toolbar');
    toolbar.replaceChildren();

    toolbar.append(
        el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete selected', onClick: () => emit('action:delete-selected') }),
        el('button', { class: 'btn', type: 'button', text: 'Hardlink selected', onClick: () => emit('action:hardlink-selected') })
    );

    toolbar.append(buildLinkedFilter());

    if (tool === 'similar-images') {
        const segmented = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'View mode' }, [
            el('button', {
                class: `seg-btn${state.viewMode === 'list' ? ' active' : ''}`,
                type: 'button',
                role: 'radio',
                text: 'List',
                'aria-checked': String(state.viewMode === 'list'),
                onClick: () => setViewMode('list'),
            }),
            el('button', {
                class: `seg-btn${state.viewMode === 'gallery' ? ' active' : ''}`,
                type: 'button',
                role: 'radio',
                text: 'Gallery',
                'aria-checked': String(state.viewMode === 'gallery'),
                onClick: () => setViewMode('gallery'),
            }),
        ]);
        toolbar.append(segmented);
    }
}

function setViewMode(mode) {
    state.viewMode = mode;
    state.currentPage = 1;
    renderResults();
}

// --- Main render ------------------------------------------------------

function flattenFiles() {
    const flat = [];
    for (const [groupIdx, group] of state.groups.entries()) {
        const files = group.files || [];
        if (files.length === 0) continue;

        if (state.linkedFilter === 'hide') {
            const inodes = new Set(files.map((f) => f.inode).filter((i) => i && i > 0));
            const allSameInode = inodes.size <= 1 && files.every((f) => f.inode && f.inode > 0);
            if (allSameInode) continue;
        }

        for (const file of files) {
            if (state.linkedFilter === 'only' && !state.linkedPaths.has(file.path)) continue;
            flat.push({ file, groupIdx, group });
        }
    }
    return flat;
}

function sortFlat(flat, tool) {
    const columns = SORT_COLUMNS[tool];
    if (!columns || !state.sortColumn || state.sortDirection === 'none') return flat;
    const column = columns.find((c) => c.key === state.sortColumn);
    if (!column) return flat;
    const multiplier = state.sortDirection === 'asc' ? 1 : -1;

    return [...flat].sort((a, b) => {
        const va = column.getValue(a.file);
        const vb = column.getValue(b.file);
        if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * multiplier;
        return ((va || 0) - (vb || 0)) * multiplier;
    });
}

function summarize(tool, totalFiles) {
    const summaryEl = $('#results-summary');
    if (totalFiles === 0) {
        summaryEl.textContent = 'No results found';
        return;
    }
    const groups = state.groups.length;
    let text;
    if (tool === 'duplicates') {
        text = `${totalFiles} files in ${groups} groups`;
        const lost = state.summary?.lost_space || 0;
        if (lost > 0) text += ` \u2014 ${formatSize(lost)} reclaimable`;
    } else if (tool === 'similar-images') {
        text = `${totalFiles} similar images in ${groups} groups`;
    } else {
        const suffix = state.mode === 'audio' ? ' \u2014 audio fingerprint' : '';
        text = `${totalFiles} similar videos in ${groups} groups${suffix}`;
    }
    summaryEl.textContent = text;
}

export function renderResults() {
    const tool = resultTool();
    buildToolbar(tool);

    let flat = flattenFiles();
    flat = sortFlat(flat, tool);

    state.fileIndex = flat.map((entry) => entry.file);
    const totalFiles = flat.length;

    state.totalPages = Math.max(1, Math.ceil(totalFiles / state.pageSize));
    if (state.currentPage > state.totalPages) state.currentPage = 1;
    const pageStart = (state.currentPage - 1) * state.pageSize;
    const pageEnd = Math.min(pageStart + state.pageSize, totalFiles);

    summarize(tool, totalFiles);

    if (totalFiles === 0) {
        $('#table-wrap').hidden = true;
        $('#gallery-view').hidden = true;
        $('#results-header').replaceChildren();
        $('#results-body').replaceChildren(el('tr', { class: 'empty-row' }, [el('td', { colspan: '7', text: 'No files found' })]));
        $('#table-wrap').hidden = false;
        $('#pagination').replaceChildren();
        return;
    }

    if (tool === 'similar-images' && state.viewMode === 'gallery') {
        $('#table-wrap').hidden = true;
        $('#gallery-view').hidden = false;
        $('#pagination').replaceChildren();
        renderGallery(flat);
        return;
    }

    $('#gallery-view').hidden = true;
    $('#table-wrap').hidden = false;
    $('#results-header').replaceChildren(buildHeader(tool));

    const rows = [];
    const seenGroups = new Set();
    for (let i = pageStart; i < pageEnd; i++) {
        const { file, groupIdx, group } = flat[i];
        if (!seenGroups.has(groupIdx)) {
            seenGroups.add(groupIdx);
            rows.push(buildGroupRow(group, groupIdx, tool));
        }
        rows.push(buildFileRow(file, groupIdx, i, tool));
    }
    $('#results-body').replaceChildren(...rows);

    renderPagination(totalFiles);
}

function buildGroupRow(group, groupIdx, tool) {
    const files = group.files || [];
    const linkedCount = files.filter((f) => state.linkedPaths.has(f.path)).length;
    const linkedSuffix = linkedCount > 0 ? ` \u2014 ${linkedCount} linked` : '';
    const colspan = tool === 'similar-videos' ? '10' : '7';

    let label;
    if (tool === 'similar-images') {
        label = `Group ${groupIdx + 1} \u2014 similarity ${group.similarity || 0}% \u2014 ${files.length} files${linkedSuffix}`;
    } else if (tool === 'similar-videos') {
        label = state.mode === 'audio'
            ? `Group ${groupIdx + 1} \u2014 audio fingerprint \u2014 ${files.length} files${linkedSuffix}`
            : `Group ${groupIdx + 1} \u2014 similarity ${group.similarity || 0}% \u2014 ${files.length} files${linkedSuffix}`;
    } else if (group.name) {
        label = `Group ${groupIdx + 1} \u2014 "${group.name}" \u2014 ${files.length} files${linkedSuffix}`;
    } else {
        label = `Group ${groupIdx + 1} \u2014 ${files.length} files \u2014 ${formatSize(group.size || 0)}${linkedSuffix}`;
    }

    return el('tr', { class: 'group-row' }, [el('td', { colspan, text: label })]);
}

function renderPagination(totalFiles) {
    const container = $('#pagination');
    const { currentPage, totalPages, pageSize } = state;

    const prev = el('button', {
        class: 'btn btn-ghost',
        type: 'button',
        text: '\u2039 Prev',
        'aria-label': 'Previous page',
        onClick: () => gotoPage(currentPage - 1),
    });
    prev.disabled = currentPage <= 1;

    const next = el('button', {
        class: 'btn btn-ghost',
        type: 'button',
        text: 'Next \u203A',
        'aria-label': 'Next page',
        onClick: () => gotoPage(currentPage + 1),
    });
    next.disabled = currentPage >= totalPages;

    const pageInput = el('input', {
        class: 'page-input',
        type: 'number',
        min: '1',
        max: String(totalPages),
        value: String(currentPage),
        'aria-label': 'Go to page',
    });
    pageInput.addEventListener('change', () => gotoPage(parseInt(pageInput.value, 10)));

    const sizeSelect = el('select', { class: 'page-size', 'aria-label': 'Results per page' });
    for (const size of [25, 50, 100, 200, 500]) {
        sizeSelect.append(el('option', { value: String(size), text: `${size} / page` }));
    }
    sizeSelect.value = String(pageSize);
    sizeSelect.addEventListener('change', () => {
        state.pageSize = parseInt(sizeSelect.value, 10);
        state.currentPage = 1;
        renderResults();
    });

    container.replaceChildren(
        prev,
        el('span', {}, [`Page `, pageInput, ` / ${totalPages}`]),
        next,
        el('span', { text: `${totalFiles} files` }),
        sizeSelect
    );
}

function gotoPage(page) {
    if (Number.isNaN(page)) return;
    state.currentPage = Math.min(Math.max(page, 1), state.totalPages);
    renderResults();
}

// --- Gallery ----------------------------------------------------------

function galleryActions(file, groupIdx) {
    const path = file.path || '';
    const groupSource = state.sourceMap[groupIdx];
    const isSource = groupSource === path;
    const isLinked = state.linkedPaths.has(path);
    const handle = (event, action) => {
        event.stopPropagation();
        action();
    };

    const buttons = [
        el('button', {
            class: 'mini-btn',
            type: 'button',
            text: 'Open',
            'aria-label': `Open ${filename(path)}`,
            onClick: (event) => handle(event, () => openPath(path)),
        }),
        el('button', {
            class: 'mini-btn',
            type: 'button',
            text: 'Show in folder',
            'aria-label': `Show ${filename(path)} in folder`,
            onClick: (event) => handle(event, () => openPath(path, 'folder')),
        }),
    ];

    if (isSource) {
        buttons.push(el('button', {
            class: 'mini-btn is-source',
            type: 'button',
            text: '\u2605 Source',
            'aria-label': `Remove ${filename(path)} as hardlink source`,
            onClick: (event) => handle(event, () => {
                delete state.sourceMap[groupIdx];
                renderResults();
            }),
        }));
    } else if (groupSource && !isLinked) {
        buttons.push(el('button', {
            class: 'mini-btn is-link',
            type: 'button',
            text: 'Hardlink',
            'aria-label': `Hardlink ${filename(path)} to source`,
            onClick: (event) => handle(event, () => emit('action:hardlink', { source: groupSource, target: path, groupIdx })),
        }));
    } else {
        buttons.push(el('button', {
            class: 'mini-btn',
            type: 'button',
            text: 'Set source',
            'aria-label': `Set ${filename(path)} as hardlink source`,
            onClick: (event) => handle(event, () => {
                state.sourceMap[groupIdx] = path;
                renderResults();
            }),
        }));
    }

    return el('div', { class: 'gallery-actions' }, buttons);
}

function renderGallery(flat) {
    const gallery = $('#gallery-view');
    const cards = [];
    let lastGroup = -1;

    flat.forEach(({ file, groupIdx, group }, idx) => {
        if (groupIdx !== lastGroup) {
            lastGroup = groupIdx;
            const files = group.files || [];
            const linkedCount = files.filter((f) => state.linkedPaths.has(f.path)).length;
            const linkedSuffix = linkedCount > 0 ? ` \u2014 ${linkedCount} linked` : '';
            cards.push(el('div', {
                class: 'gallery-group-title',
                text: `Group ${groupIdx + 1} \u2014 similarity ${group.similarity || 0}% \u2014 ${files.length} files${linkedSuffix}`,
            }));
        }

        const path = file.path || '';
        const selected = state.selection.has(idx);
        const isLinked = state.linkedPaths.has(path);
        const width = file.width || 0;
        const height = file.height || 0;
        const resolution = width && height ? `${width}\u00D7${height}` : '';
        const similarPct = file.similarity ?? group.similarity ?? 0;
        const name = filename(path);

        const img = el('img', { class: 'gallery-thumb', alt: '', loading: 'lazy' });
        img.src = api.imagePreviewUrl(path);

        const card = el('div', {
            class: `gallery-card${selected ? ' selected' : ''}${isLinked ? ' linked' : ''}`,
            role: 'checkbox',
            tabindex: '0',
            'aria-checked': String(selected),
            'aria-label': name,
        }, [
            img,
            isLinked ? el('span', { class: 'gallery-badge-linked', text: 'Linked' }) : null,
            el('span', { class: 'gallery-name', title: path, text: name }),
            el('span', { class: 'gallery-meta', text: `${similarPct}% \u00B7 ${resolution} \u00B7 ${formatSize(file.size || 0)}` }),
            galleryActions(file, groupIdx),
            el('div', { class: 'gallery-check', text: '\u2713' }),
        ]);

        const toggle = () => {
            if (state.selection.has(idx)) state.selection.delete(idx);
            else state.selection.add(idx);
            const on = state.selection.has(idx);
            card.classList.toggle('selected', on);
            card.setAttribute('aria-checked', String(on));
        };
        card.addEventListener('click', toggle);
        card.addEventListener('keydown', (event) => {
            // Inner action buttons own their keyboard events (and stopPropagation
            // keeps their clicks from toggling the card's selection).
            if (event.target.closest('.gallery-actions')) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle();
            }
        });

        cards.push(card);
    });

    gallery.replaceChildren(...cards);
}

// --- Sorting ----------------------------------------------------------

function handleSort(key) {
    if (state.sortColumn === key) {
        if (state.sortDirection === 'asc') state.sortDirection = 'desc';
        else {
            state.sortColumn = null;
            state.sortDirection = 'none';
        }
    } else {
        state.sortColumn = key;
        state.sortDirection = 'asc';
    }
    state.currentPage = 1;
    renderResults();
}

// --- Wiring -----------------------------------------------------------

export function initResults() {
    const header = $('#results-header');
    const body = $('#results-body');
    const wrap = $('#table-wrap');

    header.addEventListener('click', (event) => {
        const th = event.target.closest('th[data-sort-key]');
        if (th) handleSort(th.dataset.sortKey);
    });

    header.addEventListener('change', (event) => {
        if (event.target.id !== 'select-all') return;
        const checked = event.target.checked;
        for (const checkbox of body.querySelectorAll('input[type="checkbox"][data-file-idx]')) {
            checkbox.checked = checked;
            const idx = parseInt(checkbox.dataset.fileIdx, 10);
            if (Number.isNaN(idx)) continue;
            if (checked) state.selection.add(idx);
            else state.selection.delete(idx);
        }
    });

    body.addEventListener('change', (event) => {
        const target = event.target;
        if (target.type !== 'checkbox' || target.dataset.fileIdx === undefined) return;
        const idx = parseInt(target.dataset.fileIdx, 10);
        if (Number.isNaN(idx)) return;
        if (target.checked) state.selection.add(idx);
        else state.selection.delete(idx);
    });

    wrap.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const groupIdx = parseInt(button.dataset.group, 10);
        const path = button.dataset.path;

        if (button.dataset.action === 'set-source') {
            state.sourceMap[groupIdx] = path;
            renderResults();
        } else if (button.dataset.action === 'clear-source') {
            delete state.sourceMap[groupIdx];
            renderResults();
        } else if (button.dataset.action === 'hardlink') {
            emit('action:hardlink', { source: state.sourceMap[groupIdx], target: path, groupIdx });
        }
    });
}
