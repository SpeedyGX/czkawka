// Shared DOM, formatting and event-bus helpers.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/**
 * Create an element. Supported attrs: class, text, html, dataset, on* handlers.
 */
export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, value);
    }

    for (const child of [].concat(children)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '\u0026amp;')
        .replace(/</g, '\u0026lt;')
        .replace(/>/g, '\u0026gt;')
        .replace(/"/g, '\u0026quot;');
}

export function escapeAttr(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '\u0026amp;')
        .replace(/</g, '\u0026lt;')
        .replace(/>/g, '\u0026gt;')
        .replace(/"/g, '\u0026quot;')
        .replace(/'/g, '\u0026#39;');
}

export function formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** i;
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function formatDate(ts) {
    if (!ts) return '';
    const date = new Date(ts > 1e12 ? ts : ts * 1000);
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatDuration(seconds) {
    if (seconds === null || seconds === undefined) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function filename(path) {
    return String(path || '').split('/').pop() || String(path || '');
}

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// --- Minimal event bus ------------------------------------------------

const bus = new Map();

export function on(event, handler) {
    if (!bus.has(event)) bus.set(event, new Set());
    bus.get(event).add(handler);
    return () => bus.get(event)?.delete(handler);
}

export function emit(event, detail) {
    for (const handler of bus.get(event) || []) {
        handler(detail);
    }
}
