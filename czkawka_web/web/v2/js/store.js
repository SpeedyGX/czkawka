// Central mutable state plus small persistence helpers.

const RECENT_KEY = 'czkawka_web_recent_dirs';
const THEME_KEY = 'czkawka_web_theme';
const MAX_RECENT = 20;

export const state = {
    activeToolId: 'duplicates',
    includedPaths: [],
    excludedPaths: [],
    recentDirs: [],

    scanId: null,
    scanning: false,

    summary: null,
    groups: [],
    checkingMethod: null,
    tool: null,
    mode: null,

    // Result interaction state
    sourceMap: {},          // { [groupIndex: number]: sourcePath }
    linkedPaths: new Set(),
    linkedFilter: 'all',    // 'all' | 'hide' | 'only'
    resultsCache: {},       // { [toolId]: snapshot }

    // Pagination / sorting / view
    pageSize: 100,
    currentPage: 1,
    totalPages: 1,
    sortColumn: null,
    sortDirection: 'none',
    viewMode: 'list',       // 'list' | 'gallery'

    selection: new Set(),   // indexes into fileIndex
    fileIndex: [],          // flat file list for the current page window
};

export const prefs = {
    theme: 'auto',
};

function readJSON(raw, fallback) {
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

export function initStore() {
    state.recentDirs = readJSON(localStorage.getItem(RECENT_KEY), []);
    prefs.theme = localStorage.getItem(THEME_KEY) || 'auto';
}

export function pushRecent(path) {
    if (!path) return;
    state.recentDirs = [path, ...state.recentDirs.filter((p) => p !== path)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(state.recentDirs));
}

export function clearRecent() {
    state.recentDirs = [];
    localStorage.removeItem(RECENT_KEY);
}

export function saveTheme(theme) {
    prefs.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
}

/** Reset per-result view state (sorting, selection, pagination …). */
export function resetViewState() {
    state.sortColumn = null;
    state.sortDirection = 'none';
    state.viewMode = 'list';
    state.selection = new Set();
    state.fileIndex = [];
    state.currentPage = 1;
    state.totalPages = 1;
    state.sourceMap = {};
    state.linkedFilter = 'all';
}

/** Snapshot the current results so switching tools can restore them. */
export function cacheResults(toolId) {
    if (!toolId || state.groups.length === 0) return;
    state.resultsCache[toolId] = {
        summary: state.summary,
        groups: state.groups,
        checkingMethod: state.checkingMethod,
        tool: state.tool,
        mode: state.mode,
        sourceMap: { ...state.sourceMap },
    };
}
