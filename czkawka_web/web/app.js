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
    // Pagination
    pageSize: 100,
    currentPage: 1,
    totalPages: 1,
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
            STATE.linkedPaths = new Set();
            STATE.currentPage = 1;
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
    STATE.summary = null;
    STATE.groups = [];
    STATE.tool = null;
    STATE.sourceMap = {};
    STATE.linkedPaths = new Set();
    STATE.hideLinked = false;
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

function renderResults() {
    const { groups, summary, tool } = STATE;

    // --- Action buttons — all tools get Delete + Hardlink + Hide linked ---
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
        STATE.currentPage = 1;
        renderResults();
    });
    hideLabel.appendChild(hideCb);
    hideLabel.appendChild(document.createTextNode(' Hide already-linked files'));
    resultsActions.appendChild(hideLabel);

    // --- PASS 1: Pre-compute visible files and build _fileIndex ---
    STATE._fileIndex = [];
    const groupMetas = [];
    let totalFiles = 0;
    const totalGroups = groups.length;

    for (const [gi, group] of groups.entries()) {
        const allFiles = group.files || [];
        if (allFiles.length === 0) continue;

        // hideLinked logic: hide groups where ALL files share the same inode
        let allSameInode = false;
        if (STATE.hideLinked) {
            const uniqueInodes = new Set(allFiles.map(f => f.inode).filter(i => i && i > 0));
            allSameInode = uniqueInodes.size <= 1 && allFiles.every(f => f.inode && f.inode > 0);
            if (allSameInode) continue;
        }

        const fileStartIdx = totalFiles;
        for (const f of allFiles) {
            STATE._fileIndex.push(f);
            totalFiles++;
        }
        const fileEndIdx = totalFiles;

        groupMetas.push({
            gi,
            group,
            files: allFiles,
            fileStartIdx,
            fileEndIdx,
        });
    }

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

    // --- Table header ---
    resultsHeader.innerHTML = buildResultsHeader(tool);

    // --- PASS 2: Build HTML for current page only ---
    if (!groups || groups.length === 0 || totalFiles === 0) {
        const colspan = tool === 'similar-images' ? 8 : tool === 'similar-videos' ? 10 : 7;
        resultsBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;padding:20px;color:#8892b0">No files found</td></tr>`;
        renderPageControls(0);
        return;
    }

    let rows = [];

    for (const meta of groupMetas) {
        const { gi, group, files, fileStartIdx, fileEndIdx } = meta;

        // Does this group's file range overlap the current page?
        if (fileStartIdx >= pageEnd || fileEndIdx <= pageStart) continue;

        // --- Group header row ---
        const groupSize = group.size || 0;
        const groupName = group.name || '';
        const similarity = group.similarity || 0;

        // Count linked files in this group (for header display)
        const linkedCount = files.filter(f => STATE.linkedPaths.has(f.path)).length;
        const linkedSuffix = linkedCount > 0 ? ` (${linkedCount} linked)` : '';

        let headerLabel;
        if (tool === 'similar-images') {
            headerLabel = `Group ${gi + 1} – similarity ${similarity}% – ${files.length} files${linkedSuffix}`;
        } else if (tool === 'similar-videos') {
            headerLabel = `Group ${gi + 1} – similarity ${similarity}% – ${files.length} similar videos${linkedSuffix}`;
        } else if (groupName) {
            headerLabel = `Group ${gi + 1} – "${escHtml(groupName)}" – ${files.length} files${linkedSuffix}`;
        } else {
            headerLabel = `Group ${gi + 1} – ${files.length} files – ${formatSize(groupSize)}${linkedSuffix}`;
        }

        const colspan = tool === 'similar-images' ? 8 : tool === 'similar-videos' ? 10 : 7;
        rows.push(`<tr class="group-header"><td colspan="${colspan}" style="font-weight:bold;font-size:13px;padding:8px 10px">${escHtml(headerLabel)}</td></tr>`);

        // --- File rows for this group within page range ---
        for (let fi = 0; fi < files.length; fi++) {
            const idx = fileStartIdx + fi;
            if (idx < pageStart || idx >= pageEnd) continue;

            const file = files[fi];
            const path = file.path || '';
            const size = file.size || 0;
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
                const sim = file.similarity ?? 0;

                extraCells = `
                    <td style="text-align:right;white-space:nowrap">${file.inode || '—'}</td>
                    <td style="white-space:nowrap">${sim}%</td>
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
                                <span class="file-cell-text" title="${escHtml(path)}">${escHtml(path)}</span>${linkedTag}
                            </div>
                        </td>`;
                } else {
                    pathColspan = `<td>${isLinked ? `<div class="path-with-badge"><span class="path-text" title="${escHtml(path)}">${escHtml(path)}</span>${linkedTag}</div>` : `<span class="path-text" title="${escHtml(path)}">${escHtml(path)}</span>`}</td>`;
                }
            } else {
                // duplicates / hardlink
                extraCells = `
                    <td style="text-align:right;white-space:nowrap">${file.inode || '—'}</td>
                    <td style="text-align:right;white-space:nowrap">${formatSize(size)}</td>
                    <td style="white-space:nowrap">${formatDate(mdate)}</td>
                    ${hashCell}`;
                const linkedTag = isLinked ? '<span class="linked-badge">(Linked)</span>' : '';
                pathColspan = `<td>${isLinked ? `<div class="path-with-badge"><span class="path-text" title="${escHtml(path)}">${escHtml(path)}</span>${linkedTag}</div>` : `<span class="path-text" title="${escHtml(path)}">${escHtml(path)}</span>`}</td>`;
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
        }
    }

    resultsBody.innerHTML = rows.join('');

    // --- Page controls ---
    renderPageControls(totalFiles);
}

function buildResultsHeader(tool) {
    if (tool === 'similar-images') {
        return '<tr><th style="width:36px"><input type="checkbox" id="select-all"></th>' +
            '<th>Path</th><th style="width:90px">Inode</th><th style="width:80px">Diff</th><th style="width:90px">Resolution</th>' +
            '<th style="width:80px">Size</th><th style="width:110px">Action</th></tr>';
    }
    if (tool === 'similar-videos') {
        return '<tr><th style="width:36px"><input type="checkbox" id="select-all"></th>' +
            '<th>Path</th><th style="width:90px">Inode</th><th style="width:80px">Diff</th><th style="width:80px">Duration</th><th style="width:70px">Codec</th>' +
            '<th style="width:60px">FPS</th><th style="width:90px">Resolution</th><th style="width:80px">Size</th>' +
            '<th style="width:110px">Action</th></tr>';
    }
    // duplicates
    return '<tr><th style="width:36px"><input type="checkbox" id="select-all"></th>' +
        '<th>Path</th><th style="width:90px">Inode</th><th style="width:100px">Size</th><th style="width:160px">Modified</th>' +
        (STATE.checkingMethod === 'Hash' ? '<th style="width:80px">Hash</th>' : '') +
        '<th style="width:110px">Action</th></tr>';
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
        <button id="page-prev" ${currentPage <= 1 ? 'disabled' : ''}>‹ Prev</button>
        <span id="page-info">
            Page
            <input type="number" id="page-input" value="${currentPage}" min="1" max="${totalPages}">
            / ${totalPages}
        </span>
        <button id="page-next" ${currentPage >= totalPages ? 'disabled' : ''}>Next ›</button>
        <select id="page-size">
            <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / page</option>
            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / page</option>
            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100 / page</option>
            <option value="200" ${pageSize === 200 ? 'selected' : ''}>200 / page</option>
            <option value="500" ${pageSize === 500 ? 'selected' : ''}>500 / page</option>
        </select>
    `;
}

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

// Delegated change on #results-header for select-all checkbox
// The <thead> element persists across innerHTML swaps.
resultsHeader.addEventListener('change', (e) => {
    if (e.target.id === 'select-all') {
        $$('#results-body tr:not(.group-header) input[type="checkbox"]')
            .forEach(cb => cb.checked = e.target.checked);
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
        const srcInode = getInodeForPath(source);
        const targets = paths.filter(p => {
            if (p === source) return false;
            if (srcInode === 0) return true; // no inode info, include target
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
            // Ensure current page still exists after deletion
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
    return String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

// --- Folder browser modal ---
function openFolderBrowser(target) {
    const overlay = $('#folder-browser-overlay');
    overlay.style.display = 'flex';
    overlay.dataset.target = target;

    const pathInput = target === 'included' ? $('#new-included') : $('#new-excluded');
    const startPath = pathInput.value.trim() || '/';

    navigateFolderBrowser(startPath);
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
            const escapedPath = escHtml(entry.path);

            html += `<div class="${entryClass}" data-path="${escapedPath}" data-is-dir="${entry.is_dir}">
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

// --- Init ---
renderTools();
renderToolOptions();

// Scan and Stop button handlers
scanBtn.addEventListener('click', startScan);
stopBtn.addEventListener('click', stopScan);

// + button and Enter key handlers for manual path entry
$('#add-included').addEventListener('click', () => addIncluded($('#new-included').value.trim()));
$('#new-included').addEventListener('keydown', (e) => { if (e.key === 'Enter') addIncluded($('#new-included').value.trim()); });

$('#add-excluded').addEventListener('click', () => addExcluded($('#new-excluded').value.trim()));
$('#new-excluded').addEventListener('keydown', (e) => { if (e.key === 'Enter') addExcluded($('#new-excluded').value.trim()); });

statusBar.textContent = 'Ready. Add directories and click Scan.';
