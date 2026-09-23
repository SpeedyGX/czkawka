// Open behaviour: browser-viewable files open in a new tab, everything else is
// handed to the OS through the server (/api/files/open).

import { api } from './api.js';

// Extensions the browser can render on its own: images, playable video
// containers and plain-text/printable documents. Add new entries here to make
// a format open in a tab instead of the OS default application.
const BROWSER_VIEWABLE = new Set([
    // Images
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico',
    // Video containers browsers can play
    'mp4', 'm4v', 'webm', 'mov',
    // Documents / plain text
    'pdf', 'txt', 'md', 'json', 'xml', 'csv', 'log', 'html',
]);

/** True when the browser can display this file type directly. */
export function isBrowserViewable(path) {
    const name = String(path || '').split(/[\\/]/).pop() || '';
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) return false;
    return BROWSER_VIEWABLE.has(name.slice(dot + 1).toLowerCase());
}

/** Ask the server to open `path` with the OS default application. */
export function openWithSystem(path, mode = 'folder') {
    return api.openWithSystem({ path, mode });
}

/**
 * Open a file. Browser-viewable types open in a new tab; anything else is
 * delegated to the OS. Never opens a download dialog.
 *
 * Resolves to `{ opened, error }`; `error` is set when a system open failed.
 */
export async function openTarget(path) {
    if (!path) return { opened: false, error: 'No path' };

    if (isBrowserViewable(path)) {
        window.open(api.fileUrl(path), '_blank', 'noopener');
        return { opened: true, error: null };
    }

    try {
        const result = await openWithSystem(path, 'file');
        return { opened: Boolean(result?.opened), error: result?.error || null };
    } catch (err) {
        return { opened: false, error: err.message };
    }
}
