// Thin wrappers around the czkawka_web REST API.

async function request(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail || `${response.status} ${response.statusText}`);
    }
    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? response.json() : response.text();
}

function postJSON(url, body) {
    return request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// Last path segment, tolerant of both separators (the server may run on Windows).
function basename(path) {
    const parts = String(path || '').split(/[\\/]/);
    return parts[parts.length - 1] || 'file';
}

export const api = {
    scanDuplicates: (body) => postJSON('/api/scan/duplicates', body),
    scanSimilarImages: (body) => postJSON('/api/scan/similar-images', body),
    scanSimilarVideos: (body) => postJSON('/api/scan/similar-videos', body),
    stopScan: (scanId) => postJSON('/api/scan/stop', { scan_id: scanId }),

    results: (scanId) => request(`/api/results/${encodeURIComponent(scanId)}`),
    browse: (path) => request(`/api/browse?path=${encodeURIComponent(path)}`),

    hardlink: (sourcePaths, targetPaths) => postJSON('/api/files/hardlink', {
        source_paths: sourcePaths,
        target_paths: targetPaths,
    }),
    deleteFiles: (scanId, paths) => postJSON('/api/files/delete', { scan_id: scanId || '', paths }),
    openWithSystem: (payload) => postJSON('/api/files/open', payload),

    imagePreviewUrl: (path) => `/api/preview/image?path=${encodeURIComponent(path)}`,
    // The trailing segment is cosmetic (tab title); the real path comes from `path`.
    fileUrl: (path) => `/api/file/${encodeURIComponent(basename(path))}?path=${encodeURIComponent(path)}`,
    videoPreviewUrl: (path) => `/api/preview/video?path=${encodeURIComponent(path)}`,
    progressUrl: (scanId) => {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        return `${protocol}://${window.location.host}/api/scan/progress/${encodeURIComponent(scanId)}`;
    },
};
