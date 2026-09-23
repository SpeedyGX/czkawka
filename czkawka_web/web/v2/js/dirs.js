// Included/excluded directory lists, recent-directory menus and the folder browser modal.

import { $, el } from './util.js';
import { state, pushRecent, clearRecent } from './store.js';
import { api } from './api.js';

const RECENT_TARGETS = ['included', 'excluded'];

function renderList(listEl, paths, remove) {
    listEl.replaceChildren(
        ...paths.map((path) =>
            el('li', { class: 'chip' }, [
                el('span', { class: 'chip-text', title: path, text: path }),
                el('button', {
                    class: 'chip-remove',
                    type: 'button',
                    'aria-label': `Remove ${path}`,
                    text: '\u2715',
                    onClick: () => remove(path),
                }),
            ])
        )
    );
}

export function renderDirs() {
    renderList($('#included-list'), state.includedPaths, removeIncluded);
    renderList($('#excluded-list'), state.excludedPaths, removeExcluded);
}

export function addIncluded(path) {
    if (!path || state.includedPaths.includes(path)) return;
    state.includedPaths.push(path);
    pushRecent(path);
    renderDirs();
    renderRecentMenus();
}

export function addExcluded(path) {
    if (!path || state.excludedPaths.includes(path)) return;
    state.excludedPaths.push(path);
    pushRecent(path);
    renderDirs();
    renderRecentMenus();
}

function removeIncluded(path) {
    state.includedPaths = state.includedPaths.filter((p) => p !== path);
    renderDirs();
}

function removeExcluded(path) {
    state.excludedPaths = state.excludedPaths.filter((p) => p !== path);
    renderDirs();
}

// --- Recent directories ----------------------------------------------

function renderRecentList(target) {
    const list = $(`#recent-${target}-list`);
    if (!list) return;

    if (state.recentDirs.length === 0) {
        list.replaceChildren(el('div', { class: 'recent-empty', text: 'No recent directories' }));
        return;
    }

    list.replaceChildren(
        ...state.recentDirs.map((path) =>
            el('button', {
                class: 'recent-item',
                type: 'button',
                title: path,
                text: path,
                onClick: () => {
                    if (target === 'included') addIncluded(path);
                    else addExcluded(path);
                    closeRecentMenus();
                },
            })
        )
    );
}

export function renderRecentMenus() {
    for (const target of RECENT_TARGETS) renderRecentList(target);
}

function closeRecentMenus() {
    for (const target of RECENT_TARGETS) {
        const menu = $(`#recent-${target}-menu`);
        $(`#recent-${target}`)?.setAttribute('aria-expanded', 'false');
        if (menu) menu.hidden = true;
    }
}

function toggleRecentMenu(target) {
    const menu = $(`#recent-${target}-menu`);
    if (!menu) return;
    const willOpen = menu.hidden;
    closeRecentMenus();
    if (willOpen) {
        menu.hidden = false;
        $(`#recent-${target}`)?.setAttribute('aria-expanded', 'true');
    }
}

// --- Folder browser modal --------------------------------------------

let browseTarget = null;

function openBrowser(target) {
    browseTarget = target;
    $('#browse-modal').hidden = false;
    const input = target === 'included' ? $('#new-included') : $('#new-excluded');
    navigate(input.value.trim() || '/');
    $('#browse-path')?.focus();
}

function closeBrowser() {
    $('#browse-modal').hidden = true;
    browseTarget = null;
}

async function navigate(path) {
    const list = $('#browse-list');
    const statusEl = $('#browse-state');
    const pathInput = $('#browse-path');

    pathInput.value = path;
    list.replaceChildren();
    statusEl.classList.remove('error');
    statusEl.hidden = false;
    statusEl.textContent = 'Loading\u2026';

    let data;
    try {
        data = await api.browse(path);
    } catch (err) {
        statusEl.classList.add('error');
        statusEl.textContent = `Network error: ${err.message}`;
        return;
    }

    if (data.error) {
        statusEl.classList.add('error');
        statusEl.textContent = data.error;
        return;
    }

    const entries = data.entries || [];
    if (entries.length === 0) {
        statusEl.textContent = 'Empty directory';
        return;
    }

    statusEl.hidden = true;
    if (data.current_path) pathInput.value = data.current_path;

    list.replaceChildren(
        ...entries.map((entry) => {
            const isDir = Boolean(entry.is_dir);
            const item = el(
                'li',
                {
                    class: `browse-item${isDir ? ' is-dir' : ''}`,
                    role: 'option',
                    tabindex: '0',
                    title: entry.path,
                },
                [
                    el('span', { class: 'b-icon', text: isDir ? '\u{1F4C1}' : '\u{1F4C4}' }),
                    el('span', { class: 'b-name', text: entry.name }),
                ]
            );

            const activate = () => {
                if (isDir) navigate(entry.path);
            };
            item.addEventListener('click', activate);
            item.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    activate();
                }
            });
            return item;
        })
    );
}

// --- Wiring -----------------------------------------------------------

export function initDirs() {
    renderDirs();
    renderRecentMenus();

    for (const target of RECENT_TARGETS) {
        $(`#add-${target}`)?.addEventListener('click', () => {
            const input = $(`#new-${target}`);
            const value = input.value.trim();
            (target === 'included' ? addIncluded : addExcluded)(value);
            if (state.recentDirs.includes(value)) input.value = '';
        });
        $(`#new-${target}`)?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            const input = event.currentTarget;
            const value = input.value.trim();
            (target === 'included' ? addIncluded : addExcluded)(value);
            if (value) input.value = '';
        });
        $(`#browse-${target}`)?.addEventListener('click', () => openBrowser(target));
        $(`#recent-${target}`)?.addEventListener('click', () => toggleRecentMenu(target));
    }

    $('#recent-clear')?.addEventListener('click', () => {
        clearRecent();
        renderRecentMenus();
        closeRecentMenus();
    });

    $('#browse-close')?.addEventListener('click', closeBrowser);
    $('#browse-cancel')?.addEventListener('click', closeBrowser);
    $('#browse-modal')?.addEventListener('click', (event) => {
        if (event.target === $('#browse-modal')) closeBrowser();
    });
    $('#browse-path')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const value = event.currentTarget.value.trim();
        if (value) navigate(value);
    });
    $('#browse-select')?.addEventListener('click', () => {
        const value = $('#browse-path').value.trim();
        if (!value) return;
        if (browseTarget === 'included') addIncluded(value);
        else if (browseTarget === 'excluded') addExcluded(value);
        closeBrowser();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !$('#browse-modal').hidden) closeBrowser();
    });

    // Dismiss the recent menus when interacting outside of them.
    document.addEventListener('click', (event) => {
        if (event.target.closest('.recent-menu') || event.target.closest('[id^="recent-"]')) return;
        closeRecentMenus();
    });
}
