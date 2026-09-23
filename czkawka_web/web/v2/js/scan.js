// Scan orchestration, progress UI and the WebSocket progress stream.

import { $ } from './util.js';
import { state, resetViewState, cacheResults } from './store.js';
import { api } from './api.js';
import { toast } from './ui.js';
import { collectToolParams } from './tools.js';
import { showResults, clearResults, detectHardlinks } from './results.js';

const RECONNECT_BASE = 1500;
const RECONNECT_MAX = 30000;

const SCAN_CALL = {
    duplicates: 'scanDuplicates',
    images: 'scanSimilarImages',
    videos: 'scanSimilarVideos',
};

let socket = null;
let reconnectTimer = null;
let reconnectDelay = RECONNECT_BASE;
let intentionalClose = false;

function setScanningUI(scanning) {
    state.scanning = scanning;
    $('#scan-btn').hidden = scanning;
    $('#stop-btn').hidden = !scanning;
    if (!scanning) reconnectDelay = RECONNECT_BASE;
}

function setProgress(percent, label) {
    const value = Math.min(Math.max(Math.round(percent), 0), 100);
    const bar = $('#progress');
    bar.hidden = false;
    bar.setAttribute('aria-valuenow', String(value));
    $('#progress-fill').style.width = `${value}%`;
    $('#progress-stage').textContent = label;
    $('#progress-pct').textContent = `${value}%`;
}

export function initScan() {
    $('#scan-btn').addEventListener('click', startScan);
    $('#stop-btn').addEventListener('click', stopScan);
}

export async function startScan() {
    if (state.includedPaths.length === 0) {
        toast('Add at least one included path first', 'warning');
        return;
    }

    clearResults();
    setScanningUI(true);
    setProgress(0, 'Starting\u2026');

    const body = {
        included_paths: state.includedPaths,
        excluded_paths: state.excludedPaths,
        recursive: $('#recursive').checked,
        use_cache: $('#use-cache').checked,
        min_file_size: parseInt($('#min-size').value, 10) || 0,
        ...collectToolParams(),
    };

    try {
        const data = await api[SCAN_CALL[state.activeToolId]](body);
        state.scanId = data.scan_id;
        intentionalClose = false;
        connectWebSocket(state.scanId);
    } catch (err) {
        toast(`Scan failed: ${err.message}`, 'error');
        setScanningUI(false);
    }
}

export function stopScan() {
    intentionalClose = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (state.scanId) api.stopScan(state.scanId).catch(() => {});
    state.scanId = null;
    setScanningUI(false);
    toast('Scan stopped', 'info', 2500);
}

function connectWebSocket(scanId) {
    socket = new WebSocket(api.progressUrl(scanId));

    socket.onmessage = (event) => {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            return;
        }

        if (message.type === 'progress') {
            const total = message.total || 1;
            const percent = total > 0 ? (message.current / total) * 100 : 0;
            const stage = message.stage ? String(message.stage).replace(/^Duplicate/, '') : '';
            setProgress(percent, `${stage} ${message.current}/${message.total}`);
        } else if (message.type === 'completed') {
            setScanningUI(false);
            if (message.status === 'completed') {
                setProgress(100, 'Completed');
                fetchResults(scanId);
            } else {
                toast(`Scan ${message.status}${message.reason ? `: ${message.reason}` : ''}`, message.status === 'failed' ? 'error' : 'warning');
            }
        }
    };

    socket.onerror = () => {
        if (!intentionalClose) scheduleReconnect(scanId);
    };

    socket.onclose = () => {
        socket = null;
        if (state.scanning && !intentionalClose) {
            toast('Connection lost \u2013 reconnecting\u2026', 'warning', 2500);
            scheduleReconnect(scanId);
        }
    };
}

function scheduleReconnect(scanId) {
    if (reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!state.scanning || intentionalClose) return;
        connectWebSocket(scanId);
        // Exponential backoff capped at RECONNECT_MAX.
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX);
    }, reconnectDelay);
}

export async function fetchResults(scanId) {
    let data;
    try {
        data = await api.results(scanId);
    } catch (err) {
        toast(`Could not fetch results: ${err.message}`, 'error');
        return;
    }

    const results = data?.results;
    if (!results || !results.groups) {
        toast(`Scan finished without results (${data?.status ?? 'unknown'})`, 'warning');
        return;
    }

    state.summary = results.summary || {};
    state.groups = results.groups;
    state.checkingMethod = results.checking_method || null;
    state.tool = results.tool || null;
    state.mode = results.mode || null;

    resetViewState();
    detectHardlinks();
    cacheResults(state.activeToolId);
    showResults();

    const files = state.groups.reduce((sum, group) => sum + (group.files || []).length, 0);
    toast(`Scan completed \u2013 ${files} files in ${state.groups.length} groups`, 'success');
}
