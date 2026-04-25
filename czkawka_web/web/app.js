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
    sourceMap: {},           // { [groupIdx: number]: string } — one source per group
    linkedPaths: new Set(),  // paths hardlinked in this session
    hideLinked: false,       // toggle to hide already-linked files
    resultsCache: {},        // { [toolId: string]: { summary, groups, checkingMethod, tool, linkedPaths: string[] } }
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
            linkedPaths: [...STATE.linkedPaths],
            sourceMap: { ...STATE.sourceMap },
        };
    }

    STATE.activeTool = tool;
    STATE.hideLinked = false;
    $$('#tools button').forEach(b => b.classList.toggle('active', b.dataset.toolId === toolId));
    renderToolOptions();

    // Restore cached results if available
    const cached = STATE.resultsCache[toolId];
    if (cached) {
        STATE.summary = cached.summary;
        STATE.groups = cached.groups;
        STATE.checkingMethod = cached.checkingMethod;
        STATE.tool = cached.tool;
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
                </select>
            </label>
            <label>Algorithm:
                <select id="img-hash-alg">
                    <option value="Gradient" selected>Gradient</option>
                    <option value="Mean">Mean</option>
                    <option value="Blockhash">Blockhash</option>
                </select>
            </label>
        `;
    } else if (id === 'videos') {
        toolOptions.innerHTML = `
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
    }
}

// --- Directory management ---
function addIncluded(path) {
    if (!path || STATE.includedPaths.includes(path)) return;
    STATE.includedPaths.push(path);
    renderDirs();
}

function addExcluded(path) {
    if (!path || STATE.excludedPaths.includes(path)) return;
    STATE.excludedPaths.push(path);
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
        `<div class="dir-item"><span>${escHtml(p)}</span><span class="remove" onclick="removeIncluded('${escHtml(p)}')">✕</span></div>`
    ).join('');
    excludedList.innerHTML = STATE.excludedPaths.map(p =>
        `<div class="dir-item"><span>${escHtml(p)}</span><span class="remove" onclick="removeExcluded('${escHtml(p)}')">✕</span></div>`
    ).join('');
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
        body.hash_alg = $('#img-hash-alg').value;
    } else if (id === 'videos') {
        body.tolerance = parseInt($('#vid-tolerance').value) || 10;
        body.skip_forward = parseInt($('#vid-skip').value) || 15;
        body.hash_duration = parseInt($('#vid-hash-duration').value) || 10;
        body.crop_detect = $('#vid-crop')?.value || 'Letterbox';
        body.generate_thumbnails = $('#vid-thumbnails')?.checked ?? true;
    }

    try {
        const resp = await fetch(STATE.activeTool.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await resp.json();
        STATE.scanId = data.scan_id;
        connectWebSocket(STATE.scanId);
    } catch (err) {
        statusBar.textContent = `Error: ${err.message}`;
        stopScan();
    }
}

function stopScan() {
    if (STATE.scanId) {
        fetch(`/api/scan/stop`, { method: 'POST', body: JSON.stringify({ scan_id: STATE.scanId }), headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    }
    STATE.scanning = false;
    scanBtn.disabled = false;
    scanBtn.style.display = 'inline';
    stopBtn.style.display = 'none';
    STATE.scanId = null;
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
        statusBar.textContent = 'WebSocket error';
        stopScan();
    };
    STATE.ws.onclose = () => {
        STATE.ws = null;
    };
}

/// Scan groups for files sharing the same inode (existing hardlinks) and
/// populate STATE.linkedPaths so the UI can show the "(Linked)" tag.
/// All files that share an inode get the tag (not just the redundant copies).
function detectHardlinksInResults() {
    console.log('[detectHardlinksInResults] tool:', STATE.tool, 'groups:', STATE.groups.length);
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
                console.log('[detect] NO INODE for:', f.path, 'inode:', ino);
                continue;
            }
            filesWithInode++;
            if (seen.has(ino)) {
                matches++;
                STATE.linkedPaths.add(f.path);
                STATE.linkedPaths.add(seen.get(ino));
                console.log('[detect] HIT inode:', ino, 'between', seen.get(ino), 'and', f.path);
            } else {
                seen.set(ino, f.path);
            }
        }
    }
    console.log('[detectHardlinksInResults] totalFiles:', totalFiles, 'withInode:', filesWithInode, 'matches:', matches, 'linkedPaths:', [...STATE.linkedPaths]);
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
            STATE.linkedPaths = new Set();
            detectHardlinksInResults();

            // Cache the results for this tool
            STATE.resultsCache[STATE.activeTool.id] = {
                summary: STATE.summary,
                groups: STATE.groups,
                checkingMethod: STATE.checkingMethod,
                tool: STATE.tool,
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

// --- Results rendering (grouped display) ---
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
    STATE.summary = null;
    STATE.groups = [];
    STATE.tool = null;
    STATE.sourceMap = {};
    STATE.linkedPaths = new Set();
    STATE.hideLinked = false;
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

function renderResults() {
    const { groups, summary, tool } = STATE;
    const totalFiles = summary && summary.files ? summary.files : 0;
    const totalGroups = summary && summary.groups ? summary.groups : 0;
    const lostSpace = summary && summary.lost_space ? summary.lost_space : 0;

    // Action buttons — all tools get Delete + Hardlink + Hide linked
    resultsActions.innerHTML = '';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Selected';
    deleteBtn.id = 'delete-btn';
    deleteBtn.addEventListener('click', deleteSelected);
    resultsActions.appendChild(deleteBtn);

    const hardlinkBtn = document.createElement('button');
    hardlinkBtn.textContent = 'Hardlink Selected';
    hardlinkBtn.id = 'hardlink-btn';
    hardlinkBtn.style.background = '#0f3460';
    hardlinkBtn.addEventListener('click', hardlinkSelected);
    resultsActions.appendChild(hardlinkBtn);

    const hideLabel = document.createElement('label');
    hideLabel.style.cssText = 'margin-left:12px;font-size:13px;color:#8892b0;cursor:pointer;user-select:none';
    const hideCb = document.createElement('input');
    hideCb.type = 'checkbox';
    hideCb.checked = STATE.hideLinked;
    hideCb.addEventListener('change', () => {
        STATE.hideLinked = hideCb.checked;
        renderResults();
    });
    hideLabel.appendChild(hideCb);
    hideLabel.appendChild(document.createTextNode(' Hide already-linked files'));
    resultsActions.appendChild(hideLabel);

    if (totalFiles > 0) {
        const summaryParts = [];
        if (tool === 'duplicates') {
            summaryParts.push(`Found ${totalFiles} files in ${totalGroups} groups`);
            if (lostSpace > 0) summaryParts.push(`${formatSize(lostSpace)} lost`);
        } else if (tool === 'similar-images') {
            summaryParts.push(`Found ${totalFiles} similar images in ${totalGroups} groups`);
        } else if (tool === 'similar-videos') {
            summaryParts.push(`Found ${totalFiles} similar videos in ${totalGroups} groups`);
        }
        resultsSummary.textContent = summaryParts.join(' — ');
    } else {
        resultsSummary.textContent = 'No results found';
    }

    // Table header
    resultsHeader.innerHTML = buildResultsHeader(tool);

    $('#select-all')?.addEventListener('change', (e) => {
        $$('#results-body tr:not(.group-header) input[type="checkbox"]').forEach(cb => cb.checked = e.target.checked);
    });

    if (!groups || groups.length === 0) {
        resultsBody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#8892b0">No files found</td></tr>';
        return;
    }

    // Track group index for data attributes — _fileIndex must match rendered rows exactly
    let globalFileIdx = 0;
    let rows = [];
    STATE._fileIndex = [];

    groups.forEach((group, gi) => {
        const allFiles = group.files || [];
        if (allFiles.length === 0) return;

        // Determine if the entire group is one hardlink cluster (all files share one inode)
        const uniqueInodes = new Set(allFiles.map(f => f.inode).filter(i => i && i > 0));
        const allSameInode = uniqueInodes.size <= 1 && allFiles.every(f => f.inode && f.inode > 0);

        // Skip the whole group when hide-linked is active AND every file in the group
        // shares the same inode (i.e., the group is fully hardlinked).
        if (STATE.hideLinked && allSameInode) return;

        // Files to render — when hide-linked is active with mixed groups,
        // show everything (individual files are never hidden, only whole groups
        // where every file shares the same inode).
        const files = allFiles;

        if (files.length === 0) return;

        // Group header row
        const groupSize = group.size || 0;
        const groupName = group.name || '';
        const similarity = group.similarity || 0;

        // Count linked files in this group (for header display)
        const linkedCount = STATE.hideLinked
            ? 0
            : allFiles.filter(f => STATE.linkedPaths.has(f.path)).length;
        const linkedSuffix = linkedCount > 0 ? ` (${linkedCount} linked)` : '';

        let headerLabel;
        if (tool === 'similar-images') {
            headerLabel = `Group ${gi + 1} – similarity ${similarity}% – ${files.length} files${linkedSuffix}`;
        } else if (tool === 'similar-videos') {
            headerLabel = `Group ${gi + 1} – ${files.length} similar videos${linkedSuffix}`;
        } else if (groupName) {
            headerLabel = `Group ${gi + 1} – "${escHtml(groupName)}" – ${files.length} files${linkedSuffix}`;
        } else {
            headerLabel = `Group ${gi + 1} – ${files.length} files – ${formatSize(groupSize)}${linkedSuffix}`;
        }

        // colspan = all data columns + checkbox + action column
        const colspan = tool === 'similar-images' ? 7 : tool === 'similar-videos' ? 8 : 6;
        rows.push(`<tr class="group-header"><td colspan="${colspan}" style="font-weight:bold;font-size:13px;padding:8px 10px">${escHtml(headerLabel)}</td></tr>`);

        // File rows
        files.forEach((file) => {
            const path = file.path || '';
            const size = file.size || 0;
            const idx = globalFileIdx++;
            STATE._fileIndex.push(file);
            const groupSource = STATE.sourceMap[gi];
            const isSource = groupSource === path;
            const isLinked = STATE.linkedPaths.has(path);

            const mdate = file.modified_date || 0;
            const hash = file.hash || '';
            const hashCell = STATE.checkingMethod === 'Hash' ? `<td style="font-family:monospace;font-size:11px">${escHtml(hash.substring(0, 12))}</td>` : '';

            const checkboxCell = `<td><input type="checkbox" data-file-idx="${idx}"></td>`;

            // Build cells based on tool type
            let extraCells = '';
            let pathColspan = '';

            if (tool === 'similar-images') {
                const width = file.width || 0;
                const height = file.height || 0;
                const diff = file.difference || 0;
                const resolution = width && height ? `${width}×${height}` : '—';
                const thumbnailUrl = `/api/preview/image?path=${encodeURIComponent(path)}`;

                extraCells = `
                    <td style="white-space:nowrap">${diff}%</td>
                    <td style="white-space:nowrap">${resolution}</td>
                    <td style="text-align:right;white-space:nowrap">${formatSize(size)}</td>`;
                const linkedTag = isLinked ? ' <span class="linked-badge">(Linked)</span>' : '';
                pathColspan = `
                    <td>
                        <div class="file-cell-with-preview">
                            <img class="preview-img" src="${thumbnailUrl}" alt="" loading="lazy">
                            <span title="${escHtml(path)}">${escHtml(path)}${linkedTag}</span>
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

                extraCells = `
                    <td style="white-space:nowrap">${formatDuration(duration)}</td>
                    <td style="white-space:nowrap">${escHtml(codec)}</td>
                    <td style="white-space:nowrap">${fps}</td>
                    <td style="white-space:nowrap">${resolution}</td>
                    <td style="text-align:right;white-space:nowrap">${formatSize(size)}</td>`;
                const linkedTag = isLinked ? ' <span class="linked-badge">(Linked)</span>' : '';
                const thumbnailUrl = thumbPath ? `/api/preview/video?path=${encodeURIComponent(thumbPath)}` : '';
                if (thumbnailUrl) {
                    pathColspan = `
                        <td>
                            <div class="file-cell-with-preview">
                                <img class="preview-img" src="${thumbnailUrl}" alt="" loading="lazy">
                                <span title="${escHtml(path)}">${escHtml(path)}${linkedTag}</span>
                            </div>
                        </td>`;
                } else {
                    pathColspan = `<td title="${escHtml(path)}">${escHtml(path)}${linkedTag}</td>`;
                }
            } else {
                // duplicates / hardlink
                extraCells = `
                    <td style="text-align:right;white-space:nowrap">${formatSize(size)}</td>
                    <td style="white-space:nowrap">${formatDate(mdate)}</td>
                    ${hashCell}`;
                const linkedTag = isLinked ? ' <span class="linked-badge">(Linked)</span>' : '';
                pathColspan = `<td title="${escHtml(path)}">${escHtml(path)}${linkedTag}</td>`;
            }

            // Action column — Set as source / Hardlink to source (all tools)
            let actionCell;
            if (isSource) {
                actionCell = `<td><button class="source-btn active source-active-btn" data-group="${gi}" data-file-path="${escHtml(path)}">★ Source</button></td>`;
            } else if (groupSource && !isLinked) {
                actionCell = `<td><button class="source-btn hardlink-btn" data-group="${gi}" data-file-path="${escHtml(path)}" data-source="${escHtml(groupSource)}">Hardlink to source</button></td>`;
            } else {
                actionCell = `<td><button class="source-btn set-source-btn" data-group="${gi}" data-file-path="${escHtml(path)}">Set as source</button></td>`;
            }

            const rowClass = (isSource ? 'source-row' : 'file-row') + (isLinked ? ' row-linked' : '');
            rows.push(`<tr class="${rowClass}" data-group="${gi}" data-file-idx="${idx}">
                ${checkboxCell}
                ${pathColspan}
                ${extraCells}
                ${actionCell}
            </tr>`);
        });
    });

    resultsBody.innerHTML = rows.join('');

    // Bind hardlink source buttons
    $$('.set-source-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const group = parseInt(btn.dataset.group);
            const filePath = btn.dataset.filePath;
            setSourceFile(group, filePath);
        });
    });
    $$('.source-active-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Toggle off — clear source for this group
            const group = parseInt(btn.dataset.group);
            delete STATE.sourceMap[group];
            renderResults();
        });
    });
    $$('.hardlink-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const group = parseInt(btn.dataset.group);
            const filePath = btn.dataset.filePath;
            const source = btn.dataset.source;
            performHardlink(source, filePath, group);
        });
    });
}

function buildResultsHeader(tool) {
    if (tool === 'similar-images') {
        return '<tr><th style="width:36px"><input type="checkbox" id="select-all"></th>' +
            '<th>Path</th><th style="width:80px">Diff</th><th style="width:90px">Resolution</th>' +
            '<th style="width:80px">Size</th><th style="width:110px">Action</th></tr>';
    }
    if (tool === 'similar-videos') {
        return '<tr><th style="width:36px"><input type="checkbox" id="select-all"></th>' +
            '<th>Path</th><th style="width:80px">Duration</th><th style="width:70px">Codec</th>' +
            '<th style="width:60px">FPS</th><th style="width:90px">Resolution</th><th style="width:80px">Size</th>' +
            '<th style="width:110px">Action</th></tr>';
    }
    // duplicates
    return '<tr><th style="width:36px"><input type="checkbox" id="select-all"></th>' +
        '<th>Path</th><th style="width:100px">Size</th><th style="width:160px">Modified</th>' +
        (STATE.checkingMethod === 'Hash' ? '<th style="width:80px">Hash</th>' : '') +
        '<th style="width:110px">Action</th></tr>';
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

async function hardlinkSelected() {
    // Group checked files by their data-group attribute
    const byGroup = {};
    $$('#results-body tr:not(.group-header) input[type="checkbox"]:checked').forEach(cb => {
        const tr = cb.closest('tr');
        if (!tr) return;
        const group = parseInt(tr.dataset.group);
        const fileIdx = parseInt(cb.dataset.fileIdx);
        if (!isNaN(fileIdx) && STATE._fileIndex && STATE._fileIndex[fileIdx]) {
            if (!byGroup[group]) byGroup[group] = [];
            byGroup[group].push(STATE._fileIndex[fileIdx].path);
        }
    });

    const groupEntries = Object.entries(byGroup);
    if (groupEntries.length === 0) {
        statusBar.textContent = 'No files selected';
        return;
    }

    // Build request pairs: process each group independently, skip already-linked files
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
        // Filter out source file itself AND already-linked files
        const targets = paths.filter(p => p !== source && !STATE.linkedPaths.has(p));
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
            // Mark all targets as linked — files stay in groups, just dimmed
            for (const t of allTargets) STATE.linkedPaths.add(t);
            renderResults();
        }
    } catch (err) {
        statusBar.textContent = `Hardlink error: ${err.message}`;
    }
}

// --- Delete action ---
async function deleteSelected() {
    const paths = [];
    $$('#results-body tr:not(.group-header) input[type="checkbox"]:checked').forEach(cb => {
        const fileIdx = parseInt(cb.dataset.fileIdx);
        if (!isNaN(fileIdx) && STATE._fileIndex && STATE._fileIndex[fileIdx]) {
            paths.push(STATE._fileIndex[fileIdx].path);
        }
    });

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

        if (totalFiles === 0) {
            clearResults();
            if (result.failed === 0) {
                statusBar.textContent = 'All files removed';
            }
        } else {
            renderResults();
        }
    } catch (err) {
        statusBar.textContent = `Delete error: ${err.message}`;
    }
}

// --- Helpers ---
function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

// --- Event binding ---
scanBtn.addEventListener('click', startScan);
stopBtn.addEventListener('click', stopScan);

$('#add-included').addEventListener('click', () => {
    const input = $('#new-included');
    addIncluded(input.value.trim());
    input.value = '';
});
$('#add-excluded').addEventListener('click', () => {
    const input = $('#new-excluded');
    addExcluded(input.value.trim());
    input.value = '';
});
$('#new-included').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#add-included').click(); });
$('#new-excluded').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#add-excluded').click(); });

// --- Init ---
renderTools();
renderToolOptions();
statusBar.textContent = 'Ready. Add directories and click Scan.';
