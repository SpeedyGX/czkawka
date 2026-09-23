// Czkawka Web UI – vanilla JS

const TOOLS = [
    { id: 'duplicates', name: 'Duplicate Files', endpoint: '/api/scan/duplicates' },
    { id: 'images', name: 'Similar Images', endpoint: '/api/scan/similar-images', supportsPreview: true },
    { id: 'videos', name: 'Similar Videos', endpoint: '/api/scan/similar-videos', supportsPreview: true },
];

const STATE = {
    activeTool: TOOLS[0],
    includedPaths: [],
    excludedPaths: [],
    scanId: null,
    ws: null,
    scanning: false,
    summary: null,
    groups: [],
    tool: null,
    mode: null,              // scan mode reported by the backend (e.g. 'visual' | 'audio')
    sourceMap: {},           // { [groupIdx: number]: string } — one source per group
    linkedPaths: new Set(),  // paths hardlinked in this session
    hideLinked: false,       // toggle to hide already-linked files
    resultsCache: {},        // { [toolId: string]: { summary, groups, checkingMethod, tool, mode, linkedPaths: string[] } }
    // Pagination
    pageSize: 100,
    currentPage: 1,
    totalPages: 1,
    // Sortable columns
    sortColumn: null,
    sortDirection: 'none', // 'none' | 'asc' | 'desc'
    // Gallery / List toggle
    viewMode: 'list', // 'list' | 'gallery'
    // Shared selection set (used by both list and gallery views)
    _selection: new Set(),
    _fileIndex: [],
    // Recent directories
    recentDirs: JSON.parse(localStorage.getItem('czkawka_recent_dirs') || '[]'),
    // WebSocket reconnection
    _wsIntentionalClose: false,
    _wsReconnectDelay: 2000,
    _wsReconnectTimer: null,
};

// --- Sort column definitions per tool --------------------------------
const SORT_COLUMNS = {
    duplicates: [
        { key: 'path',     label: 'Path',     getValue: (f) => f.path.toLowerCase() },
        { key: 'size',     label: 'Size',     getValue: (f) => f.size },
        { key: 'modified', label: 'Modified', getValue: (f) => f.modified_date || 0 },
    ],
    'similar-images': [
        { key: 'path',       label: 'Path',       getValue: (f) => f.path.toLowerCase() },
        { key: 'similarity', label: 'Diff',       getValue: (f) => f.similarity ?? 0 },
        { key: 'resolution', label: 'Resolution', getValue: (f) => (f.width || 0) * (f.height || 0) },
        { key: 'size',       label: 'Size',       getValue: (f) => f.size },
    ],
    'similar-videos': [
        { key: 'path',       label: 'Path',       getValue: (f) => f.path.toLowerCase() },
        { key: 'similarity', label: 'Diff',       getValue: (f) => f.similarity ?? 0 },
        { key: 'duration',   label: 'Duration',   getValue: (f) => f.duration || 0 },
        { key: 'codec',      label: 'Codec',      getValue: (f) => (f.codec || '').toLowerCase() },
        { key: 'fps',        label: 'FPS',        getValue: (f) => f.fps ?? 0 },
        { key: 'resolution', label: 'Resolution', getValue: (f) => (f.width || 0) * (f.height || 0) },
        { key: 'size',       label: 'Size',       getValue: (f) => f.size },
    ],
};

// DOM refs
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const toolsNav = $('#tools');
const scanBtn = $('#scan-btn');
const stopBtn = $('#stop-btn');
const progressBar = $('#progress-bar');
const progressFill = $('#progress-fill');
const progressText = $('#progress-text');
const includedList = $('#included-list');
const excludedList = $('#excluded-list');
const resultsPanel = $('#results-panel');
const resultsBody = $('#results-body');
const resultsHeader = $('#results-header');
const resultsSummary = $('#results-summary');
const resultsActions = $('#results-actions');
const statusBar = $('#status-bar');
const toolOptions = $('#tool-options');

// --- Tool navigation ---
function renderTools() {
    toolsNav.innerHTML = '';
    STATE.activeTool = TOOLS[0];
    TOOLS.forEach(t => {
        const btn = document.createElement('button');
        btn.textContent = t.name;
        btn.dataset.toolId = t.id;
        btn.setAttribute('aria-label', t.name + ' tool');
        btn.addEventListener('click', () => selectTool(t.id));
        if (t.id === STATE.activeTool.id) btn.classList.add('active');
        toolsNav.appendChild(btn);
    });
}

function selectTool(toolId) {
    const tool = TOOLS.find(t => t.id === toolId);
    if (!tool) return;

    // Save current results to cache before switching away
    if (STATE.groups.length > 0 && STATE.activeTool.id !== toolId) {
        STATE.resultsCache[STATE.activeTool.id] = {
            summary: STATE.summary,
            groups: STATE.groups,
            checkingMethod: STATE.checkingMethod,
            tool: STATE.tool,
            mode: STATE.mode,
            linkedPaths: [...STATE.linkedPaths],
            sourceMap: { ...STATE.sourceMap },
        };
    }

    STATE.activeTool = tool;
    STATE.hideLinked = false;
    STATE.sortColumn = null;
    STATE.sortDirection = 'none';
    STATE.viewMode = 'list';
    STATE._selection = new Set();
    STATE.currentPage = 1;
    $$('#tools button').forEach(b => b.classList.toggle('active', b.dataset.toolId === toolId));
    renderToolOptions();

    // Restore cached results if available
    const cached = STATE.resultsCache[toolId];
    if (cached) {
        STATE.summary = cached.summary;
        STATE.groups = cached.groups;
        STATE.checkingMethod = cached.checkingMethod;
        STATE.tool = cached.tool;
        STATE.mode = cached.mode || null;
        STATE.sourceMap = cached.sourceMap || {};

        // Re-detect hardlinks from inodes — cached linkedPaths may be stale
        STATE.linkedPaths = new Set();
        detectHardlinksInResults();

        showResults();
    } else {
        clearResults();
    }
}

function renderToolOptions() {
    toolOptions.innerHTML = '';
    const id = STATE.activeTool.id;

    if (id === 'duplicates') {
        toolOptions.innerHTML = `
            <label>Check method:
                <select id="dup-method">
                    <option value="Hash" selected>Hash</option>
                    <option value="Size">Size</option>
                    <option value="Name">Name</option>
                    <option value="SizeName">Size and Name</option>
                </select>
            </label>
            <label>Hash type:
                <select id="dup-hash">
                    <option value="Blake3" selected>Blake3</option>
                    <option value="CRC32">CRC32</option>
                    <option value="XXH3">XXH3</option>
                </select>
            </label>
            <label><input type="checkbox" id="dup-case-sensitive"> Case sensitive name</label>
        `;
    } else if (id === 'images') {
        toolOptions.innerHTML = `
            <label>Max difference:
                <input type="number" id="img-similarity" value="10" min="0" max="100">
            </label>
            <label>Hash size:
                <select id="img-hash-size">
                    <option value="8">8</option>
                    <option value="16" selected>16</option>
                    <option value="32">32</option>
                    <option value="64">64</option>
                </select>
            </label>
            <label>Resize Algorithm:
                <select id="img-resize-algorithm">
                    <option value="Lanczos3" selected>Lanczos3</option>
                    <option value="Gaussian">Gaussian</option>
                    <option value="CatmullRom">CatmullRom</option>
                    <option value="Triangle">Triangle</option>
                    <option value="Nearest">Nearest</option>
                </select>
            </label>
            <label>Hash Type:
                <select id="img-hash-type">
                    <option value="Mean" selected>Mean</option>
                    <option value="Gradient">Gradient</option>
                    <option value="BlockHash">BlockHash</option>
                    <option value="VertGradient">VertGradient</option>
                    <option value="DoubleGradient">DoubleGradient</option>
                    <option value="Median">Median</option>
                </select>
            </label>
            <label>Geometric invariance:
                <select id="img-geometric-invariance">
                    <option value="off" selected>Off</option>
                    <option value="mirror_flip">Mirror + Flip</option>
                    <option value="mirror_flip_rotate90">Mirror + Flip + Rotate 90</option>
                </select>
            </label>
        `;
    } else if (id === 'videos') {
        toolOptions.innerHTML = `
            <label><input type="checkbox" id="vid-audio"> Compare by audio fingerprint</label>
            <label>Audio similarity (%):
                <input type="number" id="vid-audio-similarity" value="80" min="0" max="100">
            </label>
            <label>Audio length ratio (0-1):
                <input type="number" id="vid-audio-ratio" value="0.1" min="0" max="1" step="0.05">
            </label>
            <label>Min audio duration (s):
                <input type="number" id="vid-audio-duration" value="10" min="0">
            </label>
            <label>Max audio difference:
                <input type="number" id="vid-audio-difference" value="3" min="0" step="0.5">
            </label>
            <label>Tolerance:
                <input type="number" id="vid-tolerance" value="10" min="0" max="20">
            </label>
            <label>Skip forward (s):
                <input type="number" id="vid-skip" value="15" min="0" max="300">
            </label>
            <label>Hash duration (s):
                <input type="number" id="vid-hash-duration" value="10" min="2" max="60">
            </label>
            <label>Crop detect:
                <select id="vid-crop">
                    <option value="Letterbox" selected>Letterbox</option>
                    <option value="None">None</option>
                    <option value="Motion">Motion</option>
                </select>
            </label>
            <label><input type="checkbox" id="vid-thumbnails" checked> Generate thumbnails</label>
        `;
        setupVideoOptionVisibility();
    }
}

// Visual and audio comparison use disjoint options, so show only the set that
// matches the currently selected videos mode.
function setupVideoOptionVisibility() {
    const audioToggle = $('#vid-audio');
    if (!audioToggle) return;

    const visualIds = ['vid-tolerance', 'vid-skip', 'vid-hash-duration', 'vid-crop', 'vid-thumbnails'];
    const audioIds = ['vid-audio-similarity', 'vid-audio-ratio', 'vid-audio-duration', 'vid-audio-difference'];

    const setRowVisible = (inputId, visible) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        const row = input.closest('label') || input;
        row.style.display = visible ? '' : 'none';
    };

    const sync = () => {
        const audioMode = audioToggle.checked;
        visualIds.forEach(inputId => setRowVisible(inputId, !audioMode));
        audioIds.forEach(inputId => setRowVisible(inputId, audioMode));
    };

    audioToggle.addEventListener('change', sync);
    sync();
}

// --- Directory management ---
function addIncluded(path) {
    if (!path || STATE.includedPaths.includes(path)) return;
    STATE.includedPaths.push(path);
    saveToRecentDirs(path);
    renderDirs();
}

function addExcluded(path) {
    if (!path || STATE.excludedPaths.includes(path)) return;
    STATE.excludedPaths.push(path);
    saveToRecentDirs(path);
    renderDirs();
}

function removeIncluded(path) {
    STATE.includedPaths = STATE.includedPaths.filter(p => p !== path);
    renderDirs();
}

function removeExcluded(path) {
    STATE.excludedPaths = STATE.excludedPaths.filter(p => p !== path);
    renderDirs();
}

function renderDirs() {
    includedList.innerHTML = STATE.includedPaths.map(p =>
        `<div class="dir-item"><span>${escHtml(p)}</span><span class="remove" onclick="removeIncluded('${escAttr(p)}')" role="button" tabindex="0" aria-label="Remove ${escAttr(p)}">✕</span></div>`
    ).join('');
    excludedList.innerHTML = STATE.excludedPaths.map(p =>
        `<div class="dir-item"><span>${escHtml(p)}</span><span class="remove" onclick="removeExcluded('${escAttr(p)}')" role="button" tabindex="0" aria-label="Remove ${escAttr(p)}">✕</span></div>`
    ).join('');
}

// --- Recent Directories ----------------------------------
function saveToRecentDirs(path) {
    const idx = STATE.recentDirs.indexOf(path);
    if (idx !== -1) STATE.recentDirs.splice(idx, 1);

    STATE.recentDirs.unshift(path);

    if (STATE.recentDirs.length > 20) {
        STATE.recentDirs.length = 20;
    }

    localStorage.setItem('czkawka_recent_dirs', JSON.stringify(STATE.recentDirs));
    renderRecentDirs('included');
    renderRecentDirs('excluded');
}

function renderRecentDirs(target) {
    const container = document.querySelector(`.recent-dirs-list[data-target="${target}"]`);
    if (!container) return;

    if (STATE.recentDirs.length === 0) {
        container.innerHTML = '<div class="recent-dir-empty">(no recent directories)</div>';
        return;
    }

    container.innerHTML = STATE.recentDirs.map(p =>
        `<div class="recent-dir-item" data-path="${escAttr(p)}" role="button" tabindex="0">${escHtml(p)}</div>`
    ).join('');

    container.querySelectorAll('.recent-dir-item').forEach(el => {
        el.addEventListener('click', () => {
            const path = el.dataset.path;
            if (target === 'included') {
                addIncluded(path);
            } else {
                addExcluded(path);
            }
            const dd = el.closest('.recent-dirs-dropdown');
            if (dd) dd.classList.add('hidden');
        });
    });
}

function clearRecentDirs() {
    STATE.recentDirs = [];
    localStorage.removeItem('czkawka_recent_dirs');
    renderRecentDirs('included');
    renderRecentDirs('excluded');

    $$('.recent-dirs-dropdown').forEach(dd => dd.classList.add('hidden'));
    $$('.recent-dirs-toggle').forEach(t => t.classList.remove('open'));
}

function toggleRecentDirs(target) {
    const dd = document.querySelector(`.recent-dirs-dropdown[data-target="${target}"]`);
    if (!dd) return;
    dd.classList.toggle('hidden');

    const toggle = document.querySelector(`.recent-dirs-toggle[data-target="${target}"]`);
    if (toggle) toggle.classList.toggle('open');
}

// --- Scan ---
async function startScan() {
    if (STATE.includedPaths.length === 0) {
        statusBar.textContent = 'Add at least one included path';
        return;
    }

    STATE.scanning = true;
    scanBtn.disabled = true;
    scanBtn.style.display = 'none';
    stopBtn.style.display = 'inline';
    progressBar.style.display = 'block';
    updateProgress(0, 'Starting...');
    clearResults();
    statusBar.textContent = '';

    const body = {
        included_paths: STATE.includedPaths,
        excluded_paths: STATE.excludedPaths,
        recursive: $('#recursive').checked,
        use_cache: $('#use-cache').checked,
        min_file_size: parseInt($('#min-size').value) || 0,
    };

    const id = STATE.activeTool.id;

    // Tool-specific options
    if (id === 'duplicates') {
        body.checking_method = $('#dup-method').value;
        body.hash_type = $('#dup-hash').value;
        body.case_sensitive_name = $('#dup-case-sensitive').checked;
    } else if (id === 'images') {
        body.similarity = parseInt($('#img-similarity').value) || 10;
        body.hash_size = parseInt($('#img-hash-size').value) || 16;
        body.hash_alg = $('#img-hash-type').value;
        body.resize_filter = $('#img-resize-algorithm').value;
        body.geometric_invariance = $('#img-geometric-invariance').value;
    } else if (id === 'videos') {
        const audioMode = $('#vid-audio')?.checked ?? false;
        body.check_audio_content = audioMode;
        if (audioMode) {
            body.audio_similarity_percent = parseFloat($('#vid-audio-similarity').value);
            body.audio_length_ratio = parseFloat($('#vid-audio-ratio').value);
            body.audio_min_duration_seconds = parseInt($('#vid-audio-duration').value);
            body.audio_maximum_difference = parseFloat($('#vid-audio-difference').value);
        } else {
            body.tolerance = parseInt($('#vid-tolerance').value) || 10;
            body.skip_forward = parseInt($('#vid-skip').value) || 15;
            body.hash_duration = parseInt($('#vid-hash-duration').value) || 10;
            body.crop_detect = $('#vid-crop')?.value || 'Letterbox';
            body.generate_thumbnails = $('#vid-thumbnails')?.checked ?? true;
        }
    }

    try {
        const resp = await fetch(STATE.activeTool.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await resp.json();
        STATE.scanId = data.scan_id;
        STATE._wsIntentionalClose = false;
        connectWebSocket(STATE.scanId);
    } catch (err) {
        statusBar.textContent = `Error: ${err.message}`;
        stopScan();
    }
}

function stopScan() {
    STATE._wsIntentionalClose = true;
    if (STATE._wsReconnectTimer) {
        clearTimeout(STATE._wsReconnectTimer);
        STATE._wsReconnectTimer = null;
    }
    if (STATE.scanId) {
        fetch(`/api/scan/stop`, { method: 'POST', body: JSON.stringify({ scan_id: STATE.scanId }), headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    }
    STATE.scanning = false;
    scanBtn.disabled = false;
    scanBtn.style.display = 'inline';
    stopBtn.style.display = 'none';
    STATE.scanId = null;
    STATE._wsReconnectDelay = 2000;
}

function updateProgress(pct, text) {
    progressFill.style.width = `${Math.min(pct, 100)}%`;
    progressText.textContent = text;
}

// --- WebSocket ---
function connectWebSocket(scanId) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/api/scan/progress/${scanId}`;

    STATE.ws = new WebSocket(wsUrl);
    STATE.ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'progress') {
                const total = msg.total || 1;
                const pct = total > 0 ? Math.round((msg.current / total) * 100) : 0;
                const stageName = msg.stage ? msg.stage.replace(/^Duplicate/, '') : '';
                updateProgress(pct, `${stageName}: ${msg.current}/${msg.total}`);
            } else if (msg.type === 'completed') {
                updateProgress(100, msg.status === 'completed' ? 'Completed!' : msg.status);
                if (msg.status === 'completed') {
                    fetchResults(scanId);
                } else {
                    statusBar.textContent = `Scan ${msg.status}`;
                }
                STATE.scanning = false;
                scanBtn.disabled = false;
                scanBtn.style.display = 'inline';
                stopBtn.style.display = 'none';
            }
        } catch (e) {
            // ignore
        }
    };
    STATE.ws.onerror = () => {
        if (!STATE._wsIntentionalClose) {
            statusBar.textContent = 'WebSocket error – reconnecting...';
            scheduleReconnect(scanId);
        }
    };
    STATE.ws.onclose = () => {
        STATE.ws = null;
        if (STATE.scanning && !STATE._wsIntentionalClose) {
            statusBar.textContent = 'Connection lost – reconnecting...';
            scheduleReconnect(scanId);
        } else if (!STATE.scanning && !STATE._wsIntentionalClose) {
            // Connection closed after scan completed – normal, do nothing
        }
    };
}

function scheduleReconnect(scanId) {
    if (STATE._wsReconnectTimer) return;

    STATE._wsReconnectTimer = setTimeout(() => {
        STATE._wsReconnectTimer = null;
        if (!STATE.scanning || STATE._wsIntentionalClose) return;

        statusBar.textContent = `Reconnecting...`;
        connectWebSocket(scanId);

        // Exponential backoff: 2s, 4s, 8s, 16s, 30s (capped)
        STATE._wsReconnectDelay = Math.min(STATE._wsReconnectDelay * 2, 30000);
    }, STATE._wsReconnectDelay);
}

/// Scan groups for files sharing the same inode (existing hardlinks) and
/// populate STATE.linkedPaths so the UI can show the "(Linked)" tag.
/// All files that share an inode get the tag (not just the redundant copies).
function detectHardlinksInResults() {
    let totalFiles = 0;
    let filesWithInode = 0;
    let matches = 0;
    for (const group of STATE.groups) {
        const files = group.files || [];
        const seen = new Map(); // inode → path of first occurrence
        for (const f of files) {
            totalFiles++;
            const ino = f.inode;
            if (!ino || ino === 0) {
                continue;
            }
            filesWithInode++;
            if (seen.has(ino)) {
                matches++;
                STATE.linkedPaths.add(f.path);
                STATE.linkedPaths.add(seen.get(ino));
            } else {
                seen.set(ino, f.path);
            }
        }
    }
}

async function fetchResults(scanId) {
    try {
        const resp = await fetch(`/api/results/${scanId}`);
        if (!resp.ok) {
            statusBar.textContent = 'Scan completed!';
            return;
        }
        const data = await resp.json();
        if (data.results && data.results.groups) {
            STATE.summary = data.results.summary || {};
            STATE.groups = data.results.groups;
            STATE.checkingMethod = data.results.checking_method;
            STATE.tool = data.results.tool || STATE.activeTool.id;
            STATE.mode = data.results.mode || null;
            STATE.linkedPaths = new Set();
            STATE._selection = new Set();
            STATE.currentPage = 1;
            detectHardlinksInResults();

            // Cache the results for this tool
            STATE.resultsCache[STATE.activeTool.id] = {
                summary: STATE.summary,
                groups: STATE.groups,
                checkingMethod: STATE.checkingMethod,
                tool: STATE.tool,
                mode: STATE.mode,
                linkedPaths: [...STATE.linkedPaths],
                sourceMap: { ...STATE.sourceMap },
            };

            showResults();
        } else {
            statusBar.textContent = `Scan completed – status: ${data.status}`;
        }
    } catch (err) {
        statusBar.textContent = 'Scan completed!';
    }
}

// --- Results rendering (grouped display with pagination) ---
function showResults() {
    resultsPanel.style.display = 'block';
    renderResults();
}

function clearResults() {
    resultsPanel.style.display = 'none';
    resultsBody.innerHTML = '';
    resultsHeader.innerHTML = '';
    resultsSummary.textContent = '';
    resultsActions.innerHTML = '';
    const galleryView = $('#gallery-view');
    if (galleryView) galleryView.style.display = 'none';
    const tableWrapper = $('#results-table-wrapper');
    if (tableWrapper) tableWrapper.style.display = 'block';
    STATE.summary = null;
    STATE.groups = [];
    STATE.tool = null;
    STATE.sourceMap = {};
    STATE.linkedPaths = new Set();
    STATE.hideLinked = false;
    STATE.sortColumn = null;
    STATE.sortDirection = 'none';
    STATE.viewMode = 'list';
    STATE._selection = new Set();
    STATE._fileIndex = [];
    STATE.currentPage = 1;
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(secs) {
    if (secs == null) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

// --- Sortable Results ---
function handleSortClick(columnKey) {
    if (STATE.sortColumn === columnKey) {
        if (STATE.sortDirection === 'asc') {
            STATE.sortDirection = 'desc';
        } else if (STATE.sortDirection === 'desc') {
            STATE.sortColumn = null;
            STATE.sortDirection = 'none';
        }
    } else {
        STATE.sortColumn = columnKey;
        STATE.sortDirection = 'asc';
    }
    STATE.currentPage = 1;
    renderResults();
}

function sortFilesFlat(flatFiles, columnKey, direction) {
    const tool = STATE.tool;
    const cols = SORT_COLUMNS[tool];
    if (!cols) return flatFiles;

    const colDef = cols.find(c => c.key === columnKey);
    if (!colDef) return flatFiles;

    const multiplier = direction === 'asc' ? 1 : -1;

    return [...flatFiles].sort((a, b) => {
        const va = colDef.getValue(a.file);
        const vb = colDef.getValue(b.file);

        if (typeof va === 'string' && typeof vb === 'string') {
            return va.localeCompare(vb) * multiplier;
        }
        return ((va || 0) - (vb || 0)) * multiplier;
    });
}

function renderResults() {
    const { groups, summary, tool } = STATE;

    // --- Action buttons — all tools get Delete + Hardlink + Hide linked ---
    resultsActions.innerHTML = '';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Selected';
    deleteBtn.id = 'delete-btn';
    deleteBtn.setAttribute('aria-label', 'Delete selected files');
    deleteBtn.addEventListener('click', deleteSelected);
    resultsActions.appendChild(deleteBtn);

    const hardlinkBtn = document.createElement('button');
    hardlinkBtn.textContent = 'Hardlink Selected';
    hardlinkBtn.id = 'hardlink-btn';
    hardlinkBtn.style.background = '#0f3460';
    hardlinkBtn.setAttribute('aria-label', 'Hardlink selected files');
    hardlinkBtn.addEventListener('click', hardlinkSelected);
    resultsActions.appendChild(hardlinkBtn);

    const hideLabel = document.createElement('label');
    hideLabel.style.cssText = 'margin-left:12px;font-size:13px;color:#8892b0;cursor:pointer;user-select:none';
    const hideCb = document.createElement('input');
    hideCb.type = 'checkbox';
    hideCb.checked = STATE.hideLinked;
    hideCb.setAttribute('aria-label', 'Hide already-linked files');
    hideCb.addEventListener('change', () => {
        STATE.hideLinked = hideCb.checked;
        STATE.currentPage = 1;
        renderResults();
    });
    hideLabel.appendChild(hideCb);
    hideLabel.appendChild(document.createTextNode(' Hide already-linked files'));
    resultsActions.appendChild(hideLabel);

    // View toggle for similar-images
    if (tool === 'similar-images') {
        const toggleGroup = document.createElement('div');
        toggleGroup.className = 'view-toggle';
        toggleGroup.setAttribute('role', 'radiogroup');
        toggleGroup.setAttribute('aria-label', 'View mode');
        toggleGroup.innerHTML = `
            <button class="view-toggle-btn ${STATE.viewMode === 'list' ? 'active' : ''}" data-view="list" role="radio" aria-checked="${STATE.viewMode === 'list'}" aria-label="List view">List</button>
            <button class="view-toggle-btn ${STATE.viewMode === 'gallery' ? 'active' : ''}" data-view="gallery" role="radio" aria-checked="${STATE.viewMode === 'gallery'}" aria-label="Gallery view">Gallery</button>
        `;
        toggleGroup.addEventListener('click', (e) => {
            const btn = e.target.closest('.view-toggle-btn');
            if (!btn) return;
            setViewMode(btn.dataset.view);
        });
        resultsActions.appendChild(toggleGroup);
    }

    // --- Build flat file list ---
    let flatFiles = [];
    for (const [gi, group] of groups.entries()) {
        const allFiles = group.files || [];
        if (allFiles.length === 0) continue;

        if (STATE.hideLinked) {
            const uniqueInodes = new Set(allFiles.map(f => f.inode).filter(i => i && i > 0));
            const allSameInode = uniqueInodes.size <= 1 && allFiles.every(f => f.inode && f.inode > 0);
            if (allSameInode) continue;
        }

        for (const f of allFiles) {
            flatFiles.push({ file: f, groupIdx: gi, group });
        }
    }

    // Sort if active
    if (STATE.sortColumn && STATE.sortDirection !== 'none') {
        flatFiles = sortFilesFlat(flatFiles, STATE.sortColumn, STATE.sortDirection);
    }

    // Build _fileIndex
    STATE._fileIndex = flatFiles.map(ff => ff.file);
    const totalFiles = flatFiles.length;

    // --- Compute pagination ---
    STATE.totalPages = Math.max(1, Math.ceil(totalFiles / STATE.pageSize));
    if (STATE.currentPage > STATE.totalPages) STATE.currentPage = 1;
    const pageStart = (STATE.currentPage - 1) * STATE.pageSize;
    const pageEnd = Math.min(pageStart + STATE.pageSize, totalFiles);

    // --- Summary text ---
    const lostSpace = summary && summary.lost_space ? summary.lost_space : 0;
    if (totalFiles > 0) {
        const summaryParts = [];
        if (tool === 'duplicates') {
            summaryParts.push(`Found ${totalFiles} files in ${groups.length} groups`);
            if (lostSpace > 0) summaryParts.push(`${formatSize(lostSpace)} lost`);
        } else if (tool === 'similar-images') {
            summaryParts.push(`Found ${totalFiles} similar images in ${groups.length} groups`);
        } else if (tool === 'similar-videos') {
            const modeSuffix = STATE.mode === 'audio' ? ' — audio fingerprint' : '';
            summaryParts.push(`Found ${totalFiles} similar videos in ${groups.length} groups${modeSuffix}`);
        }
        resultsSummary.textContent = summaryParts.join(' — ');
    } else {
        resultsSummary.textContent = 'No results found';
    }

    // --- Route to gallery view if applicable ---
    if (tool === 'similar-images' && STATE.viewMode === 'gallery') {
        const tableWrapper = $('#results-table-wrapper');
        if (tableWrapper) tableWrapper.style.display = 'none';
        resultsHeader.innerHTML = '';
        renderGalleryView(flatFiles, totalFiles);
        return;
    }

    // Ensure table wrapper is visible in list mode
    const tableWrapper = $('#results-table-wrapper');
    if (tableWrapper) tableWrapper.style.display = 'block';
    const galleryView = $('#gallery-view');
    if (galleryView) galleryView.style.display = 'none';

    // --- Table header ---
    resultsHeader.innerHTML = buildResultsHeader(tool);

    // --- Build rows for current page ---
    if (totalFiles === 0) {
        const colspan = tool === 'similar-images' ? 7 : tool === 'similar-videos' ? 10 : 7;
        resultsBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;padding:20px;color:#8892b0">No files found</td></tr>`;
        renderPageControls(0);
        return;
    }

    let rows = [];
    const seenGroupsOnPage = new Set();

    for (let i = pageStart; i < pageEnd; i++) {
        const { file, groupIdx: gi, group } = flatFiles[i];
        const allFiles = group.files || [];

        // Group header if not seen on this page yet
        if (!seenGroupsOnPage.has(gi)) {
            seenGroupsOnPage.add(gi);
            const groupSize = group.size || 0;
            const groupName = group.name || '';
            const similarity = group.similarity || 0;
            const linkedCount = allFiles.filter(f => STATE.linkedPaths.has(f.path)).length;
            const linkedSuffix = linkedCount > 0 ? ` (${linkedCount} linked)` : '';

            let headerLabel;
            if (tool === 'similar-images') {
                headerLabel = `Group ${gi + 1} – similarity ${similarity}% – ${allFiles.length} files${linkedSuffix}`;
            } else if (tool === 'similar-videos') {
                headerLabel = STATE.mode === 'audio'
                    ? `Group ${gi + 1} – audio fingerprint – ${allFiles.length} similar videos${linkedSuffix}`
                    : `Group ${gi + 1} – similarity ${similarity}% – ${allFiles.length} similar videos${linkedSuffix}`;
            } else if (groupName) {
                headerLabel = `Group ${gi + 1} – "${escHtml(groupName)}" – ${allFiles.length} files${linkedSuffix}`;
            } else {
                headerLabel = `Group ${gi + 1} – ${allFiles.length} files – ${formatSize(groupSize)}${linkedSuffix}`;
            }

            const colspan = tool === 'similar-images' ? 7 : tool === 'similar-videos' ? 10 : 7;
            rows.push(`<tr class="group-header"><td colspan="${colspan}" style="font-weight:bold;font-size:13px;padding:8px 10px">${escHtml(headerLabel)}</td></tr>`);
        }

        const path = file.path || '';
        const size = file.size || 0;
        const idx = i;
        const groupSource = STATE.sourceMap[gi];
        const isSource = groupSource === path;
        const isLinked = STATE.linkedPaths.has(path);

        const mdate = file.modified_date || 0;
        const hash = file.hash || '';
        const hashCell = STATE.checkingMethod === 'Hash' ? `<td style="font-family:monospace;font-size:11px">${escHtml(hash.substring(0, 12))}</td>` : '';

        const isChecked = STATE._selection.has(idx);
        const checkboxCell = `<td><input type="checkbox" data-file-idx="${idx}" ${isChecked ? 'checked' : ''} aria-label="Select ${escAttr(path.split('/').pop() || path)}"></td>`;

        // Build cells based on tool type
        let extraCells = '';
        let pathColspan = '';

        if (tool === 'similar-images') {
            const width = file.width || 0;
            const height = file.height || 0;
            const sim = file.similarity ?? 0;
            const resolution = width && height ? `${width}×${height}` : '—';
            const thumbnailUrl = `/api/preview/image?path=${encodeURIComponent(path)}`;

            extraCells = `
                <td style="text-align:right;white-space:nowrap">${file.inode || '—'}</td>
                <td style="white-space:nowrap">${sim}%</td>
                <td style="white-space:nowrap">${resolution}</td>
                <td style="text-align:right;white-space:nowrap">${formatSize(size)}</td>`;
            const linkedTag = isLinked ? ' <span class="linked-badge">(Linked)</span>' : '';
            pathColspan = `
                <td>
                    <div class="file-cell-with-preview">
                        <img class="preview-img" src="${thumbnailUrl}" alt="" loading="lazy">
                        <span title="${escAttr(path)}">${escHtml(path)}${linkedTag}</span>
                    </div>
                </td>`;
        } else if (tool === 'similar-videos') {
            const duration = file.duration || 0;
            const codec = file.codec || '—';
            const fps = file.fps != null ? file.fps.toFixed(1) : '—';
            const width = file.width || 0;
            const height = file.height || 0;
            const resolution = width && height ? `${width}×${height}` : '—';
            const thumbPath = file.thumbnail_path || '';
            const sim = file.similarity ?? 0;
            // Audio-fingerprint rows report difference 0, so the derived percentage is not
            // a meaningful visual similarity — show a dash instead of a misleading 100%.
            const simLabel = STATE.mode === 'audio' ? '—' : (sim + '%');

            extraCells = `
                <td style="text-align:right;white-space:nowrap">${file.inode || '—'}</td>
                <td style="white-space:nowrap">${simLabel}</td>
                <td style="white-space:nowrap">${formatDuration(duration)}</td>
                <td style="white-space:nowrap">${escHtml(codec)}</td>
                <td style="white-space:nowrap">${fps}</td>
                <td style="white-space:nowrap">${resolution}</td>
                <td style="text-align:right;white-space:nowrap">${formatSize(size)}</td>`;
            const linkedTag = isLinked ? '<span class="linked-badge">(Linked)</span>' : '';
            const thumbnailUrl = thumbPath ? `/api/preview/video?path=${encodeURIComponent(thumbPath)}` : '';
            if (thumbnailUrl) {
                pathColspan = `
                    <td>
                        <div class="file-cell-with-preview">
                            <img class="preview-img" src="${thumbnailUrl}" alt="" loading="lazy">
                            <span class="file-cell-text" title="${escAttr(path)}">${escHtml(path)}</span>${linkedTag}
                        </div>
                    </td>`;
            } else {
                pathColspan = `<td>${isLinked ? `<div class="path-with-badge"><span class="path-text" title="${escAttr(path)}">${escHtml(path)}</span>${linkedTag}</div>` : `<span class="path-text" title="${escAttr(path)}">${escHtml(path)}</span>`}</td>`;
            }
        } else {
            // duplicates / hardlink
            extraCells = `
                <td style="text-align:right;white-space:nowrap">${file.inode || '—'}</td>
                <td style="text-align:right;white-space:nowrap">${formatSize(size)}</td>
                <td style="white-space:nowrap">${formatDate(mdate)}</td>
                ${hashCell}`;
            const linkedTag = isLinked ? '<span class="linked-badge">(Linked)</span>' : '';
            pathColspan = `<td>${isLinked ? `<div class="path-with-badge"><span class="path-text" title="${escAttr(path)}">${escHtml(path)}</span>${linkedTag}</div>` : `<span class="path-text" title="${escAttr(path)}">${escHtml(path)}</span>`}</td>`;
        }

        // Action column — Set as source / Hardlink to source (all tools)
        let actionCell;
        if (isSource) {
            actionCell = `<td><button class="source-btn active source-active-btn" data-group="${gi}" data-file-path="${escAttr(path)}" aria-label="Remove as hardlink source">★ Source</button></td>`;
        } else if (groupSource && !isLinked) {
            actionCell = `<td><button class="source-btn hardlink-btn" data-group="${gi}" data-file-path="${escAttr(path)}" data-source="${escAttr(groupSource)}" aria-label="Hardlink to source">Hardlink to source</button></td>`;
        } else {
            actionCell = `<td><button class="source-btn set-source-btn" data-group="${gi}" data-file-path="${escAttr(path)}" aria-label="Set as hardlink source">Set as source</button></td>`;
        }

        const rowClass = (isSource ? 'source-row' : 'file-row') + (isLinked ? ' row-linked' : '');
        rows.push(`<tr class="${rowClass}" data-group="${gi}" data-file-idx="${idx}">
            ${checkboxCell}
            ${pathColspan}
            ${extraCells}
            ${actionCell}
        </tr>`);
    }

    resultsBody.innerHTML = rows.join('');

    // --- Page controls ---
    renderPageControls(totalFiles);
}

function buildResultsHeader(tool) {
    const cols = SORT_COLUMNS[tool];
    const headers = [];

    // Checkbox column
    headers.push('<th style="width:36px"><input type="checkbox" id="select-all" aria-label="Select all files"></th>');

    // Path column (always first data column, sortable)
    let pathLabel = 'Path';
    const pathSort = STATE.sortColumn === 'path';
    const pathArrow = pathSort
        ? (STATE.sortDirection === 'asc' ? ' ▲' : STATE.sortDirection === 'desc' ? ' ▼' : '')
        : '';
    headers.push(`<th data-sort-col="path" class="${pathSort ? 'sort-active' : ''}" style="cursor:pointer" aria-sort="${STATE.sortDirection === 'asc' ? 'ascending' : STATE.sortDirection === 'desc' ? 'descending' : 'none'}">Path<span class="sort-indicator${pathSort ? ' active' : ''}">${pathArrow}</span></th>`);

    if (tool === 'similar-images') {
        // Inode (not sortable)
        headers.push('<th style="width:90px">Inode</th>');
        // Diff, Resolution, Size (sortable)
        ['similarity', 'resolution', 'size'].forEach(key => {
            const col = cols.find(c => c.key === key);
            if (!col) return;
            const isActive = STATE.sortColumn === key;
            const arrow = isActive
                ? (STATE.sortDirection === 'asc' ? ' ▲' : STATE.sortDirection === 'desc' ? ' ▼' : '')
                : '';
            const width = key === 'similarity' ? '80px' : key === 'resolution' ? '90px' : '80px';
            headers.push(`<th data-sort-col="${key}" class="${isActive ? 'sort-active' : ''}" style="width:${width};cursor:pointer" aria-sort="${isActive ? (STATE.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}">${col.label}<span class="sort-indicator${isActive ? ' active' : ''}">${arrow}</span></th>`);
        });
    } else if (tool === 'similar-videos') {
        // Inode (not sortable)
        headers.push('<th style="width:90px">Inode</th>');
        // Diff, Duration, Codec, FPS, Resolution, Size (sortable)
        ['similarity', 'duration', 'codec', 'fps', 'resolution', 'size'].forEach(key => {
            const col = cols.find(c => c.key === key);
            if (!col) return;
            const isActive = STATE.sortColumn === key;
            const arrow = isActive
                ? (STATE.sortDirection === 'asc' ? ' ▲' : STATE.sortDirection === 'desc' ? ' ▼' : '')
                : '';
            const widths = { similarity: '80px', duration: '80px', codec: '70px', fps: '60px', resolution: '90px', size: '80px' };
            headers.push(`<th data-sort-col="${key}" class="${isActive ? 'sort-active' : ''}" style="width:${widths[key]};cursor:pointer" aria-sort="${isActive ? (STATE.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}">${col.label}<span class="sort-indicator${isActive ? ' active' : ''}">${arrow}</span></th>`);
        });
    } else {
        // duplicates: Inode, Size, Modified, (Hash)
        headers.push('<th style="width:90px">Inode</th>');
        ['size', 'modified'].forEach(key => {
            const col = cols.find(c => c.key === key);
            if (!col) return;
            const isActive = STATE.sortColumn === key;
            const arrow = isActive
                ? (STATE.sortDirection === 'asc' ? ' ▲' : STATE.sortDirection === 'desc' ? ' ▼' : '')
                : '';
            const width = key === 'size' ? '100px' : '160px';
            headers.push(`<th data-sort-col="${key}" class="${isActive ? 'sort-active' : ''}" style="width:${width};cursor:pointer" aria-sort="${isActive ? (STATE.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}">${col.label}<span class="sort-indicator${isActive ? ' active' : ''}">${arrow}</span></th>`);
        });
        if (STATE.checkingMethod === 'Hash') {
            headers.push('<th style="width:80px">Hash</th>');
        }
    }

    // Action column
    headers.push('<th style="width:110px">Action</th>');

    return '<tr>' + headers.join('') + '</tr>';
}

function renderPageControls(totalFiles) {
    const container = $('#page-controls');
    if (!container) return;

    if (totalFiles === 0) {
        container.innerHTML = '';
        return;
    }

    const { currentPage, totalPages, pageSize } = STATE;

    container.innerHTML = `
        <button id="page-prev" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Previous page">‹ Prev</button>
        <span id="page-info">
            Page
            <input type="number" id="page-input" value="${currentPage}" min="1" max="${totalPages}" aria-label="Go to page">
            / ${totalPages}
        </span>
        <button id="page-next" ${currentPage >= totalPages ? 'disabled' : ''} aria-label="Next page">Next ›</button>
        <select id="page-size" aria-label="Results per page">
            <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / page</option>
            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / page</option>
            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100 / page</option>
            <option value="200" ${pageSize === 200 ? 'selected' : ''}>200 / page</option>
            <option value="500" ${pageSize === 500 ? 'selected' : ''}>500 / page</option>
        </select>
    `;
}

// --- Sort click handler (event delegation on results-header) ---
resultsHeader.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort-col]');
    if (!th) return;
    handleSortClick(th.dataset.sortCol);
});

// --- Event delegation ---

// Delegated click on #results-body for action buttons (set-source, source-active, hardlink)
// Bound once; survives innerHTML swaps because #results-body persists.
resultsBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.set-source-btn, .source-active-btn, .hardlink-btn');
    if (!btn) return;

    const group = parseInt(btn.dataset.group);
    const filePath = btn.dataset.filePath;

    if (btn.classList.contains('set-source-btn')) {
        setSourceFile(group, filePath);
    } else if (btn.classList.contains('source-active-btn')) {
        delete STATE.sourceMap[group];
        renderResults();
    } else if (btn.classList.contains('hardlink-btn')) {
        const source = btn.dataset.source;
        performHardlink(source, filePath, group);
    }
});

// Delegated change on #results-body for checkbox changes (sync with _selection)
resultsBody.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox' && e.target.dataset.fileIdx !== undefined) {
        const idx = parseInt(e.target.dataset.fileIdx);
        if (isNaN(idx)) return;
        if (e.target.checked) {
            STATE._selection.add(idx);
        } else {
            STATE._selection.delete(idx);
        }
    }
});

// Delegated change on #results-header for select-all checkbox
// The <thead> element persists across innerHTML swaps.
resultsHeader.addEventListener('change', (e) => {
    if (e.target.id === 'select-all') {
        const checked = e.target.checked;
        $$('#results-body tr:not(.group-header) input[type="checkbox"]').forEach(cb => {
            cb.checked = checked;
            const idx = parseInt(cb.dataset.fileIdx);
            if (!isNaN(idx)) {
                if (checked) {
                    STATE._selection.add(idx);
                } else {
                    STATE._selection.delete(idx);
                }
            }
        });
    }
});

// Delegated handlers for pagination controls on #results-panel
resultsPanel.addEventListener('change', (e) => {
    if (e.target.id === 'page-size') {
        STATE.pageSize = parseInt(e.target.value);
        STATE.currentPage = 1;
        renderResults();
    } else if (e.target.id === 'page-input') {
        let page = parseInt(e.target.value);
        if (isNaN(page) || page < 1) page = 1;
        if (page > STATE.totalPages) page = STATE.totalPages;
        STATE.currentPage = page;
        renderResults();
    }
});

resultsPanel.addEventListener('click', (e) => {
    const pageBtn = e.target.closest('#page-prev, #page-next');
    if (!pageBtn) return;
    if (pageBtn.id === 'page-prev' && STATE.currentPage > 1) {
        STATE.currentPage--;
        renderResults();
    } else if (pageBtn.id === 'page-next' && STATE.currentPage < STATE.totalPages) {
        STATE.currentPage++;
        renderResults();
    }
});

// --- Gallery View (similar-images only) ---
function setViewMode(mode) {
    STATE.viewMode = mode;
    STATE.currentPage = 1;
    renderResults();
}

function renderGalleryView(flatFiles, totalFiles) {
    const galleryView = $('#gallery-view');
    galleryView.style.display = 'block';

    let html = '<div class="gallery-grid">';

    if (totalFiles === 0) {
        html += '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#8892b0">No files to display</div>';
    } else {
        // Show all files (no pagination in gallery mode)
        const seenGroups = new Set();

        flatFiles.forEach((ff, i) => {
            const { file, groupIdx: gi, group } = ff;
            const allFiles = group.files || [];

            if (!seenGroups.has(gi)) {
                seenGroups.add(gi);
                const similarity = group.similarity || 0;
                const linkedCount = allFiles.filter(f => STATE.linkedPaths.has(f.path)).length;
                const linkedSuffix = linkedCount > 0 ? ` (${linkedCount} linked)` : '';
                html += `<div class="gallery-group-header">Group ${gi + 1} – similarity ${similarity}% – ${allFiles.length} files${linkedSuffix}</div>`;
            }

            const path = file.path || '';
            const size = file.size || 0;
            const idx = i;
            const isSelected = STATE._selection.has(idx);
            const similarPct = file.similarity ?? group.similarity ?? 0;
            const width = file.width || 0;
            const height = file.height || 0;
            const resolution = width && height ? `${width}×${height}` : '';
            const thumbnailUrl = `/api/preview/image?path=${encodeURIComponent(path)}`;
            const filename = path.split('/').pop() || path;

            html += `
                <div class="gallery-card ${isSelected ? 'selected' : ''}" data-file-idx="${idx}" role="checkbox" aria-checked="${isSelected}" aria-label="${escAttr(filename)}" tabindex="0">
                    <img class="gallery-thumb" src="${thumbnailUrl}" alt="" loading="lazy">
                    <span class="gallery-filename" title="${escAttr(path)}">${escHtml(filename)}</span>
                    <span class="gallery-info">${similarPct}% · ${resolution} · ${formatSize(size)}</span>
                    <div class="gallery-checkbox">✓</div>
                </div>`;
        });
    }

    html += '</div>';
    galleryView.innerHTML = html;

    // Page controls hidden in gallery mode
    renderPageControls(0);

    // Bind gallery card click handlers
    galleryView.querySelectorAll('.gallery-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('a, button')) return;

            const idx = parseInt(card.dataset.fileIdx);
            if (isNaN(idx)) return;

            if (STATE._selection.has(idx)) {
                STATE._selection.delete(idx);
                card.classList.remove('selected');
                card.setAttribute('aria-checked', 'false');
            } else {
                STATE._selection.add(idx);
                card.classList.add('selected');
                card.setAttribute('aria-checked', 'true');
            }
        });

        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    });
}

// --- Hardlink source selection ---
function setSourceFile(groupIdx, filePath) {
    if (STATE.sourceMap[groupIdx] === filePath) {
        // Toggle off — remove source for this group
        delete STATE.sourceMap[groupIdx];
    } else {
        STATE.sourceMap[groupIdx] = filePath;
    }

    // Re-render to update all buttons in the group
    renderResults();
}

async function performHardlink(sourcePath, targetPath, groupIdx) {
    if (!confirm(`Create hardlink?\n\nSource: ${sourcePath.split('/').pop()}\nTarget: ${targetPath.split('/').pop()}`)) {
        return;
    }

    try {
        const resp = await fetch('/api/files/hardlink', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_paths: [sourcePath],
                target_paths: [targetPath],
            }),
        });
        const result = await resp.json();
        if (result.hardlinked > 0) {
            statusBar.textContent = `Hardlinked: ${targetPath.split('/').pop()}`;
            STATE.linkedPaths.add(targetPath);
            renderResults();
        } else if (result.skipped > 0) {
            statusBar.textContent = `Skipped (target already exists): ${targetPath.split('/').pop()}`;
        } else {
            statusBar.textContent = `Failed: ${(result.errors || ['unknown error']).join(', ')}`;
        }
    } catch (err) {
        statusBar.textContent = `Hardlink error: ${err.message}`;
    }
}

function getInodeForPath(filePath) {
    for (const group of STATE.groups) {
        for (const f of group.files || []) {
            if (f.path === filePath) return f.inode;
        }
    }
    return 0;
}

async function hardlinkSelected() {
    const selectedIdxs = [...STATE._selection];
    if (selectedIdxs.length === 0) {
        statusBar.textContent = 'No files selected';
        return;
    }

    const byGroup = {};
    for (const idx of selectedIdxs) {
        if (!STATE._fileIndex[idx]) continue;
        const file = STATE._fileIndex[idx];
        let fileGroup = -1;
        for (let gi = 0; gi < STATE.groups.length; gi++) {
            const files = STATE.groups[gi].files || [];
            if (files.includes(file)) {
                fileGroup = gi;
                break;
            }
        }
        if (fileGroup === -1) continue;
        if (!byGroup[fileGroup]) byGroup[fileGroup] = [];
        byGroup[fileGroup].push(file.path);
    }

    const groupEntries = Object.entries(byGroup);
    if (groupEntries.length === 0) {
        statusBar.textContent = 'No files selected';
        return;
    }

    const allSources = [];
    const allTargets = [];
    let totalTargets = 0;

    for (const [g, paths] of groupEntries) {
        const groupIdx = parseInt(g);
        const source = STATE.sourceMap[groupIdx];
        if (!source) {
            statusBar.textContent = `Group ${groupIdx + 1}: no source set. Use "Set as source" first.`;
            return;
        }
        const srcInode = getInodeForPath(source);
        const targets = paths.filter(p => {
            if (p === source) return false;
            if (srcInode === 0) return true;
            const tgtInode = getInodeForPath(p);
            return tgtInode === 0 || tgtInode !== srcInode;
        });
        if (targets.length === 0) continue;
        for (const t of targets) {
            allSources.push(source);
            allTargets.push(t);
        }
        totalTargets += targets.length;
    }

    if (allTargets.length === 0) {
        statusBar.textContent = 'No files to hardlink (non-source files that are not already linked)';
        return;
    }

    if (!confirm(`Hardlink ${totalTargets} file(s) across ${groupEntries.length} group(s)?`)) {
        return;
    }

    try {
        const resp = await fetch('/api/files/hardlink', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_paths: allSources,
                target_paths: allTargets,
            }),
        });
        const result = await resp.json();
        statusBar.textContent = `Hardlinked: ${result.hardlinked}, skipped: ${result.skipped}, failed: ${result.failed}`;

        if (result.hardlinked > 0 || result.skipped > 0) {
            for (const t of allTargets) STATE.linkedPaths.add(t);
            renderResults();
        }
    } catch (err) {
        statusBar.textContent = `Hardlink error: ${err.message}`;
    }
}

// --- Delete action ---
async function deleteSelected() {
    const selectedIdxs = [...STATE._selection];
    if (selectedIdxs.length === 0) {
        statusBar.textContent = 'No files selected';
        return;
    }

    const paths = [];
    for (const idx of selectedIdxs) {
        if (STATE._fileIndex[idx]) {
            paths.push(STATE._fileIndex[idx].path);
        }
    }

    if (paths.length === 0) {
        statusBar.textContent = 'No files selected';
        return;
    }

    if (!confirm(`Delete ${paths.length} file(s)?\n\n${paths.map(p => p.split('/').pop()).join('\n')}`)) {
        return;
    }

    try {
        const resp = await fetch('/api/files/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scan_id: STATE.scanId || '', paths }),
        });
        const result = await resp.json();
        statusBar.textContent = `Deleted ${result.deleted}, failed: ${result.failed}`;

        const pathSet = new Set(paths);
        STATE.groups = STATE.groups.map(group => ({
            ...group,
            files: (group.files || []).filter(f => !pathSet.has(f.path)),
        })).filter(group => (group.files || []).length > 0);

        const totalFiles = STATE.groups.reduce((sum, g) => sum + (g.files || []).length, 0);
        const totalGroups = STATE.groups.length;
        if (STATE.summary) {
            STATE.summary.files = totalFiles;
            STATE.summary.groups = totalGroups;
        }

        STATE._selection = new Set();

        if (totalFiles === 0) {
            clearResults();
            if (result.failed === 0) {
                statusBar.textContent = 'All files removed';
            }
        } else {
            if (STATE.currentPage > 1 && totalFiles <= (STATE.currentPage - 1) * STATE.pageSize) {
                STATE.currentPage--;
            }
            renderResults();
        }
    } catch (err) {
        statusBar.textContent = `Delete error: ${err.message}`;
    }
}

// --- Helpers ---
function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// --- Folder browser modal ---
function openFolderBrowser(target) {
    const overlay = $('#folder-browser-overlay');
    overlay.style.display = 'flex';
    overlay.dataset.target = target;

    const pathInput = target === 'included' ? $('#new-included') : $('#new-excluded');
    const startPath = pathInput.value.trim() || '/';

    navigateFolderBrowser(startPath);

    // Focus first focusable element in modal
    const pathField = $('#folder-browser-path');
    if (pathField) pathField.focus();
}

function closeFolderBrowser() {
    const overlay = $('#folder-browser-overlay');
    overlay.style.display = 'none';
    overlay.dataset.target = '';
    $('#folder-browser-error').style.display = 'none';
    $('#folder-browser-error').textContent = '';
}

async function navigateFolderBrowser(path) {
    const entryList = $('#folder-browser-entries');
    const pathInput = $('#folder-browser-path');
    const loading = $('#folder-browser-loading');
    const error = $('#folder-browser-error');

    pathInput.value = path;
    entryList.innerHTML = '';
    error.style.display = 'none';
    error.textContent = '';
    loading.style.display = 'block';

    try {
        const resp = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
        const data = await resp.json();

        loading.style.display = 'none';

        if (data.error) {
            error.textContent = data.error;
            error.style.display = 'block';
            return;
        }

        const entries = data.entries || [];

        if (entries.length === 0) {
            entryList.innerHTML = '<div class="entry" style="cursor:default;color:#8892b0;justify-content:center">(empty directory)</div>';
            return;
        }

        let html = '';
        for (const entry of entries) {
            const entryClass = entry.is_dir ? 'entry dir' : 'entry file';
            const icon = entry.is_dir ? '📁' : '📄';
            const escapedName = escHtml(entry.name);
            const escapedPath = escAttr(entry.path);

            html += `<div class="${entryClass}" data-path="${escapedPath}" data-is-dir="${entry.is_dir}" role="option" tabindex="0">
                <span class="entry-icon">${icon}</span>
                <span class="entry-name" title="${escapedPath}">${escapedName}</span>
            </div>`;
        }
        entryList.innerHTML = html;

        // Bind click handlers on entries
        entryList.querySelectorAll('.entry').forEach(el => {
            el.addEventListener('click', () => {
                const isDir = el.dataset.isDir === 'true';
                if (!isDir) return;
                navigateFolderBrowser(el.dataset.path);
            });
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const isDir = el.dataset.isDir === 'true';
                    if (!isDir) return;
                    navigateFolderBrowser(el.dataset.path);
                }
            });
        });

    } catch (err) {
        loading.style.display = 'none';
        error.textContent = `Network error: ${err.message}`;
        error.style.display = 'block';
    }
}

// --- Folder browser event binding ---
document.querySelectorAll('.browse-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        openFolderBrowser(btn.dataset.target);
    });
});

$('#folder-browser-close').addEventListener('click', closeFolderBrowser);

$('#folder-browser-overlay').addEventListener('click', (e) => {
    if (e.target === $('#folder-browser-overlay')) {
        closeFolderBrowser();
    }
});

$('#folder-browser-path').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const path = e.target.value.trim();
        if (path) navigateFolderBrowser(path);
    }
});

$('#folder-browser-select').addEventListener('click', () => {
    const overlay = $('#folder-browser-overlay');
    const target = overlay.dataset.target;
    const currentPath = $('#folder-browser-path').value.trim();

    if (!currentPath) return;

    if (target === 'included') {
        addIncluded(currentPath);
        $('#new-included').value = '';
    } else if (target === 'excluded') {
        addExcluded(currentPath);
        $('#new-excluded').value = '';
    }

    closeFolderBrowser();
});

// Global keyboard shortcut: Escape closes the folder browser modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#folder-browser-overlay').style.display === 'flex') {
        closeFolderBrowser();
    }
});

// --- Recent dirs delegation ---
document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.recent-dirs-toggle');
    if (toggle) {
        toggleRecentDirs(toggle.dataset.target);
        return;
    }

    const clearBtn = e.target.closest('.recent-dirs-clear');
    if (clearBtn) {
        clearRecentDirs();
        return;
    }

    // Close dropdown when clicking outside
    if (!e.target.closest('.recent-dirs-dropdown') && !e.target.closest('.recent-dirs-toggle')) {
        $$('.recent-dirs-dropdown').forEach(dd => dd.classList.add('hidden'));
        $$('.recent-dirs-toggle').forEach(t => t.classList.remove('open'));
    }
});

// --- Init ---
renderTools();
renderToolOptions();

// Init recent dirs dropdowns
renderRecentDirs('included');
renderRecentDirs('excluded');

// Scan and Stop button handlers
scanBtn.addEventListener('click', startScan);
stopBtn.addEventListener('click', stopScan);

// + button and Enter key handlers for manual path entry
$('#add-included').addEventListener('click', () => addIncluded($('#new-included').value.trim()));
$('#new-included').addEventListener('keydown', (e) => { if (e.key === 'Enter') addIncluded($('#new-included').value.trim()); });

$('#add-excluded').addEventListener('click', () => addExcluded($('#new-excluded').value.trim()));
$('#new-excluded').addEventListener('keydown', (e) => { if (e.key === 'Enter') addExcluded($('#new-excluded').value.trim()); });

statusBar.textContent = 'Ready. Add directories and click Scan.';
