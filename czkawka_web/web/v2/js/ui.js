// Reusable UI primitives: toasts, theme switching and a promise-based confirm dialog.

import { $, el } from './util.js';
import { prefs, saveTheme } from './store.js';

// --- Toasts -----------------------------------------------------------

export function toast(message, type = 'info', timeout = 5000) {
    const stack = $('#toast-stack');
    if (!stack) return () => {};

    const dismiss = () => {
        node.classList.add('leaving');
        setTimeout(() => node.remove(), 180);
    };

    const node = el('div', { class: `toast ${type}` }, [
        el('span', { class: 'toast-text', text: message }),
        el('button', {
            class: 'toast-close',
            type: 'button',
            'aria-label': 'Dismiss notification',
            text: '\u2715',
            onClick: dismiss,
        }),
    ]);

    stack.append(node);
    if (timeout > 0) setTimeout(dismiss, timeout);
    return dismiss;
}

// --- Theme ------------------------------------------------------------

const THEME_ORDER = ['auto', 'dark', 'light'];

const THEME_META = {
    auto: { icon: '\u25D0', label: 'Theme: auto' },
    dark: { icon: '\u263E', label: 'Theme: dark' },
    light: { icon: '\u2600', label: 'Theme: light' },
};

function nextTheme(theme) {
    return THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
}

function effectiveTheme() {
    if (prefs.theme === 'auto') {
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return prefs.theme;
}

function syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effectiveTheme() === 'light' ? '#f4f6fc' : '#0b1020');
}

// The toggle shows the current mode's icon (auto/dark/light), not the resolved theme.
function syncThemeButton() {
    const button = $('#theme-toggle');
    if (!button) return;

    const meta = THEME_META[prefs.theme] || THEME_META.auto;
    const icon = button.querySelector('[data-theme-icon]');
    if (icon) icon.textContent = meta.icon;

    const label = `${meta.label} \u00B7 click to switch to ${nextTheme(prefs.theme)}`;
    button.setAttribute('aria-label', label);
    button.title = label;
}

export function applyTheme() {
    document.documentElement.dataset.theme = prefs.theme;
    syncThemeColor();
    syncThemeButton();
}

export function initTheme() {
    applyTheme();
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', syncThemeColor);
}

export function cycleTheme() {
    const next = nextTheme(prefs.theme);
    saveTheme(next);
    applyTheme();
    toast(THEME_META[next].label, 'info', 2000);
    return next;
}

// --- Confirm dialog ---------------------------------------------------

export function confirmAction({
    title = 'Are you sure?',
    message = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false,
} = {}) {
    return new Promise((resolve) => {
        const overlay = el('div', { class: 'modal-overlay' });

        const close = (result) => {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            resolve(result);
        };

        const onKey = (event) => {
            if (event.key === 'Escape') close(false);
        };

        const dialog = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
            el('header', { class: 'modal-head' }, [el('h3', { text: title })]),
            el('div', { class: 'modal-body' }, [el('p', { class: 'confirm-message', text: message })]),
            el('footer', { class: 'modal-foot' }, [
                el('button', { class: 'btn btn-ghost', type: 'button', text: cancelText, onClick: () => close(false) }),
                el('button', {
                    class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
                    type: 'button',
                    text: confirmText,
                    onClick: () => close(true),
                }),
            ]),
        ]);

        overlay.append(dialog);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close(false);
        });
        document.addEventListener('keydown', onKey);
        document.body.append(overlay);
        dialog.querySelector('.btn-ghost')?.focus();
    });
}
