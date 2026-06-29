# czkawka_web — Web Interface

**Version:** 11.0.1  
**Crate:** [`czkawka_web/`](../czkawka_web)  
**Entry point:** [`src/main.rs`](../czkawka_web/src/main.rs:1)  
**Frontend:** Vanilla JS SPA in [`web/`](../czkawka_web/web)

---

## 1. Overview

`czkawka_web` is a standalone HTTP server that exposes Czkawka's file-scanning tools through a web-based single-page application (SPA). It embeds the entire frontend at compile time via [`rust-embed`](https://crates.io/crates/rust-embed), so the single binary is fully self-contained — no external static files are needed at runtime.

**Architecture:** REST + WebSocket  
- Scan *initiation* is done via HTTP POST requests (returning a `scan_id`).  
- Scan *progress* is streamed to the browser over a WebSocket connection (`/api/scan/progress/{scan_id}`).  
- Completed scan *results* are fetched via HTTP GET (`/api/results/{scan_id}`).  
- File *actions* (delete, hardlink) are POST requests.  
- The frontend is a **vanilla JavaScript SPA** — no React, Vue, or bundler. Files are served by the fallback route in [`embedded.rs`](../czkawka_web/src/embedded.rs).

---

## 2. File Structure

```
czkawka_web/
├── Cargo.toml              # Crate manifest
├── Dockerfile              # Multi-stage Docker build (Alpine + scratch)
├── docker-compose.yml      # Docker Compose setup
├── README.md               # Project README
├── src/
│   ├── main.rs             # Server entry point, router, terminal fallback
│   ├── embedded.rs         # rust-embed static file serving
│   ├── scan_manager.rs     # Scan lifecycle (create, stop, complete)
│   ├── ws.rs               # WebSocket progress handler
│   └── api/
│       ├── mod.rs          # Module declarations
│       ├── scan.rs         # Scan initiation endpoints + result serialization
│       ├── results.rs      # GET /api/results/{scan_id}
│       ├── browse.rs       # GET /api/browse?path=...
│       ├── preview.rs      # GET /api/preview/image|video
│       └── actions.rs      # POST /api/files/delete|hardlink
└── web/
    ├── index.html          # Main HTML structure
    ├── style.css           # Dark theme styles
    ├── app.js              # Active frontend JavaScript
    └── app.js.bak          # Work-in-progress version (unused extras)
```

---

## 3. Dependencies ([`Cargo.toml`](../czkawka_web/Cargo.toml:1))

| Dependency | Version | Features | Purpose |
|-----------|---------|----------|---------|
| [`czkawka_core`](../czkawka_core) | path | — | Shared scanning engine (duplicates, similar images/videos) |
| [`axum`] | 0.8 | `macros`, `ws` | HTTP framework + WebSocket support |
| [`tokio`] | 1 | `full` | Async runtime |
| [`tower-http`] | 0.6 | `cors` | CORS middleware (permissive) |
| [`serde`] | 1 | `derive` | JSON serialization/deserialization |
| [`serde_json`] | 1 | — | JSON value manipulation |
| [`futures-util`] | 0.3 | — | Async utilities (used indirectly via axum) |
| [`tracing`] | 0.1 | — | Structured logging |
| [`tracing-subscriber`] | 0.3 | — | Log output formatting |
| [`crossbeam-channel`] | 0.5 | — | Bridge between std::thread (scanner) and tokio (WebSocket) |
| [`uuid`] | 1 | `v4` | Generate unique scan IDs |
| [`image`] | 0.25 | — | Image resizing for preview thumbnails |
| [`itertools`] | 0.14 | — | Iterator utilities |
| [`rust-embed`] | 8 | — | Compile-time embedding of web/ static files |

**Key observations:**
- `axum` 0.8 with WebSocket support — the server is fully async (tokio) but scanner threads run on `std::thread` with their own tokio runtime.
- `tower-http` CORS is set to **permissive** ([`CorsLayer::permissive()`](../czkawka_web/src/main.rs:86)) — accepts any origin.
- `crossbeam-channel` is used as a bridge: scanner threads send progress via crossbeam, a forwarding thread broadcasts to tokio's `broadcast` channel for WebSocket clients.

---

## 4. Server Setup ([`src/main.rs`](../czkawka_web/src/main.rs:1))

### 4.1 Terminal Fallback (lines 21–55)

If the binary is launched without a terminal (e.g., double-click from a file manager), it attempts to re-execute itself inside a terminal emulator. Tries a prioritized list of terminals: `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `lxterminal`, `xterm`.

### 4.2 Router Configuration (lines 68–88)

```rust
let app = Router::new()
    .route("/api/browse",              get(api::browse::handle_browse))
    .route("/api/scan/duplicates",     post(api::scan::scan_duplicates))
    .route("/api/scan/hardlink",       post(api::scan::scan_hardlink))
    .route("/api/scan/similar-images", post(api::scan::scan_similar_images))
    .route("/api/scan/similar-videos", post(api::scan::scan_similar_videos))
    .route("/api/scan/stop",           post(api::scan::stop_scan_handler))
    .route("/api/preview/image",       get(api::preview::image_preview))
    .route("/api/preview/video",       get(api::preview::video_preview))
    .route("/api/results/{scan_id}",   get(api::results::get_results))
    .route("/api/scan/progress/{scan_id}", get(ws::ws_handler))
    .route("/api/files/delete",        post(api::actions::delete_files))
    .route("/api/files/hardlink",      post(api::actions::hardlink_files))
    .layer(CorsLayer::permissive())
    .fallback(get(embedded::serve_static))  // Serves index.html, app.js, style.css
    .with_state(state);
```

### 4.3 Shared State ([`AppState`](../czkawka_web/src/api/scan.rs:42))

```rust
pub(crate) struct AppState {
    pub(crate) scan_manager: Arc<ScanManager>,
}
```

A single `AppState` is created at startup and shared across all route handlers via axum's `State` extractor. It wraps `ScanManager` in `Arc` for thread-safe access.

### 4.4 Configuration (lines 90–92)

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `CZKAWKA_PORT` | `8095` | TCP port |
| `CZKAWKA_ADDRESS` | `127.0.0.1` | Bind address |

---

## 5. Static File Embedding ([`src/embedded.rs`](../czkawka_web/src/embedded.rs:1))

Uses the [`rust-embed`](https://crates.io/crates/rust-embed) crate with `#[derive(Embed)]` on the `Assets` struct (line 9–11):

```rust
#[derive(Embed)]
#[folder = "web/"]
struct Assets;
```

The [`serve_static`](../czkawka_web/src/embedded.rs:20) function:
1. Normalises the URI path (empty → `index.html`).
2. Looks up the file in the embedded archive via `Assets::get(path)`.
3. Returns the file with the correct MIME type from [`mime_type()`](../czkawka_web/src/embedded.rs:49).
4. Falls back to `404 Not Found`.

MIME types supported: `.html`, `.js`, `.css`, `.svg`, `.png`. Unknown types get `application/octet-stream`.

---

## 6. Scan Manager ([`src/scan_manager.rs`](../czkawka_web/src/scan_manager.rs:1))

The [`ScanManager`](../czkawka_web/src/scan_manager.rs:38) is the central registry for all scan sessions. It holds a `Mutex<HashMap<String, ScanState>>` keyed by UUID v4 scan IDs.

### [`ScanState`](../czkawka_web/src/scan_manager.rs:19)
| Field | Type | Description |
|-------|------|-------------|
| `status` | [`ScanStatus`](../czkawka_web/src/scan_manager.rs:11) | `Running`, `Completed`, `Stopped`, or `Failed(String)` |
| `stop_flag` | `Arc<AtomicBool>` | Set to `true` to signal cancellation to the scanner thread |
| `progress_broadcast` | `broadcast::Sender<ProgressData>` | Tokio broadcast channel for WebSocket progress updates |
| `result_json` | `Option<Value>` | Serialized scan results (set on completion) |

### Key methods:
- **`create_scan()`** (line 51): Creates a new scan session with a UUID, returns the ID, stop flag clone, and a broadcast receiver.
- **`finish_scan()`** (line 63): Sets status and stores result JSON.
- **`stop_scan()`** (line 72): Sets `stop_flag` to `true` and marks status as `Stopped`.
- **`subscribe_progress()`** (line 90): Returns a broadcast receiver for a given scan ID (used by WebSocket handler).

---

## 7. WebSocket Protocol ([`src/ws.rs`](../czkawka_web/src/ws.rs:1))

### Endpoint
```
GET /api/scan/progress/{scan_id}
```
Upgraded to WebSocket via axum's [`WebSocketUpgrade`](../czkawka_web/src/ws.rs:13).

### Server → Client Messages

**Progress update:**
```json
{
  "type": "progress",
  "stage": "DuplicatePreHashing",
  "current": 42,
  "total": 1000,
  "current_size": 1048576,
  "total_size": 52428800
}
```

**Completion:**
```json
{ "type": "completed", "status": "completed" }
{ "type": "completed", "status": "failed", "reason": "..." }
{ "type": "completed", "status": "stopped" }
```

### Protocol Details

The [`handle_socket`](../czkawka_web/src/ws.rs:20) function:
1. Subscribes to the scan's progress broadcast channel.
2. Uses `tokio::select!` to multiplex three async sources:
   - **`rx.recv()`** — new progress data from the scan thread (via crossbeam→tokio bridge).
   - **`interval.tick()`** — every 200ms, polls the scan status as a fallback (catches cases where the broadcast channel closes before the final status is set).
   - **`socket.recv()`** — listens for client disconnect (None = closed).
3. When the broadcast channel closes (`RecvError::Closed`), it sends a completion message and breaks.
4. If progress messages are dropped due to a slow consumer, it logs a warning and continues.

---

## 8. Scan Initiation ([`src/api/scan.rs`](../czkawka_web/src/api/scan.rs:1))

### Common Pattern

All scan endpoints follow the same pattern:

1. **Create scan session** via [`ScanManager::create_scan()`](../czkawka_web/src/scan_manager.rs:51) → gets `(id, stop_flag, rx)`.
2. **Build crossbeam channel** — unbounded channel for progress data from the scanner thread.
3. **Spawn forwarding thread** — reads from crossbeam receiver and forwards to tokio broadcast sender.
4. **Spawn scanner thread** on `std::thread` with `DEFAULT_THREAD_SIZE` stack, wrapped in `std::panic::catch_unwind`:
   - Configures the tool (e.g., [`DuplicateFinder`](../czkawka_core/src/tools/duplicate/core.rs), [`SimilarImages`](../czkawka_core/src/tools/similar_images), [`SimilarVideos`](../czkawka_core/src/tools/similar_videos)).
   - Calls `tool.search(&stop_flag, Some(&tx))`.
   - On completion, serializes results to JSON and calls `finish_scan()` via a temporary tokio runtime.
   - On panic, captures the panic message and marks the scan as `Failed`.
5. **Respond immediately** with `{ "scan_id": "...", "status": "started" }`.

### Available Scan Tools

| Endpoint | Handler | Tool | Request Type |
|----------|---------|------|-------------|
| `POST /api/scan/duplicates` | [`scan_duplicates`](../czkawka_web/src/api/scan.rs:94) | [`DuplicateFinder`](../czkawka_core/src/tools/duplicate) | [`ScalableScanRequest`](../czkawka_web/src/api/scan.rs:78) |
| `POST /api/scan/hardlink` | [`scan_hardlink`](../czkawka_web/src/api/scan.rs:346) | `DuplicateFinder` with `DeleteMethod::HardLink` | [`HardlinkScanRequest`](../czkawka_web/src/api/scan.rs:338) |
| `POST /api/scan/similar-images` | [`scan_similar_images`](../czkawka_web/src/api/scan.rs:452) | [`SimilarImages`](../czkawka_core/src/tools/similar_images) | [`SimilarImagesRequest`](../czkawka_web/src/api/scan.rs:441) |
| `POST /api/scan/similar-videos` | [`scan_similar_videos`](../czkawka_web/src/api/scan.rs:618) | [`SimilarVideos`](../czkawka_core/src/tools/similar_videos) | [`SimilarVideosRequest`](../czkawka_web/src/api/scan.rs:606) |

### Duplicates — [`ScalableScanRequest`](../czkawka_web/src/api/scan.rs:78)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `included_paths` | `Vec<String>` | required | Directories to scan |
| `excluded_paths` | `Option<Vec<String>>` | `[]` | Directories to exclude |
| `excluded_items` | `Option<String>` | — | Comma-separated item names |
| `allowed_extensions` | `Option<String>` | — | Comma-separated extensions |
| `excluded_extensions` | `Option<String>` | — | Comma-separated extensions |
| `recursive` | `Option<bool>` | `true` | Recurse into subdirectories |
| `min_file_size` | `Option<u64>` | `1024` | Minimum file size in bytes |
| `max_file_size` | `Option<u64>` | `u64::MAX` | Maximum file size |
| `use_cache` | `Option<bool>` | `true` | Use hash cache |
| `checking_method` | `Option<String>` | `Hash` | `Size`, `Name`, `SizeName`, or `Hash` |
| `hash_type` | `Option<String>` | `Blake3` | `CRC32`, `XXH3`, or `Blake3` |
| `case_sensitive_name` | `Option<bool>` | `false` | Case-sensitive name comparison |

### Similar Images — [`SimilarImagesRequest`](../czkawka_web/src/api/scan.rs:441)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `included_paths` | `Vec<String>` | required | Directories to scan |
| `excluded_paths` | `Option<Vec<String>>` | `[]` | Directories to exclude |
| `similarity` | `Option<u32>` | `10` | Max difference (0–100) |
| `hash_size` | `Option<u8>` | `16` | Hash size in pixels |
| `hash_alg` | `Option<String>` | `Gradient` | `Gradient`, `Mean`, `VertGradient`, `Blockhash`, `DoubleGradient` |
| `resize_filter` | `Option<String>` | `Lanczos3` | `Gaussian`, `CatmullRom`, `Triangle`, `Nearest` |
| `recursive` | `Option<bool>` | `true` | Recurse into subdirectories |

### Similar Videos — [`SimilarVideosRequest`](../czkawka_web/src/api/scan.rs:606)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `included_paths` | `Vec<String>` | required | Directories to scan |
| `excluded_paths` | `Option<Vec<String>>` | `[]` | Directories to exclude |
| `tolerance` | `Option<i32>` | `10` | Comparison tolerance |
| `skip_forward` | `Option<u32>` | `15` | Seconds to skip between hashes |
| `hash_duration` | `Option<u32>` | `10` | Total seconds to hash |
| `crop_detect` | `Option<String>` | `Letterbox` | `Letterbox`, `None`, `Motion` |
| `generate_thumbnails` | `Option<bool>` | `true` | Generate video thumbnails |
| `recursive` | `Option<bool>` | `true` | Recurse into subdirectories |

### Result Serialization

Each tool has a dedicated serializer that converts the tool's internal data structures into `serde_json::Value`:

- [`serialize_duplicate_results()`](../czkawka_web/src/api/scan.rs:213): Handles all four checking methods (`Hash`, `Size`, `Name`, `SizeName`). Each group includes file path, size, modified date, hash (for Hash method), and inode. For `Name` and `SizeName`, group names are included.
- [`serialize_similar_images_results()`](../czkawka_web/src/api/scan.rs:560): Groups include file path, size, dimensions, difference, and computed similarity percentage.
- [`serialize_similar_videos_results()`](../czkawka_web/src/api/scan.rs:721): Groups include file path, size, duration, codec, FPS, dimensions, bitrate, thumbnail path, difference, and similarity percentage.

**Inode tracking:** The helper [`inode_of()`](../czkawka_web/src/api/scan.rs:17) reads a file's inode number (Unix only). This is used on the frontend to detect pre-existing hardlinks.

---

## 9. Results Retrieval ([`src/api/results.rs`](../czkawka_web/src/api/results.rs:1))

### Endpoint
```
GET /api/results/{scan_id}
```

Returns the stored `result_json` with the current status:

```json
{
  "status": "Completed",
  "results": {
    "tool": "duplicates",
    "checking_method": "Hash",
    "summary": { "groups": 5, "files": 42, "lost_space": 104857600 },
    "groups": [ ... ]
  }
}
```

If results are not yet available (scan still running), returns `"results": null` with `"status": "Running"`.

---

## 10. File Browser ([`src/api/browse.rs`](../czkawka_web/src/api/browse.rs:1))

### Endpoint
```
GET /api/browse?path=/some/directory
```

Lists directory contents:

```json
{
  "current_path": "/home/user",
  "parent_path": "/home",
  "entries": [
    { "name": "Downloads", "is_dir": true, "path": "/home/user/Downloads" },
    { "name": "file.txt", "is_dir": false, "path": "/home/user/file.txt" }
  ],
  "error": null
}
```

**Security:** Path traversal attacks using `..` are rejected (line 26–33). The handler checks for `..` components in the requested path.

**Sorting:** Directories first (case-insensitive alphabetical), then files. A `..` parent navigation entry is prepended when not at the filesystem root.

---

## 11. Previews ([`src/api/preview.rs`](../czkawka_web/src/api/preview.rs:1))

### Image Preview
```
GET /api/preview/image?path=/path/to/file.jpg&width=300&height=300
```
- Loads the image via [`get_dynamic_image_from_path()`](../czkawka_core/src/common/image) (from czkawka_core).
- Resizes using Lanczos3 filter.
- Returns a JPEG thumbnail (default 300×300).

### Video Preview
```
GET /api/preview/video?path=/path/to/thumbnail.jpg
```
- Reads the pre-generated thumbnail file from disk (the `thumbnail_path` field from similar-videos scan results).
- Returns the JPEG file as-is via `tokio::fs::read`.

---

## 12. File Actions ([`src/api/actions.rs`](../czkawka_web/src/api/actions.rs:1))

### Delete Files
```
POST /api/files/delete
{ "scan_id": "...", "paths": ["/path/to/file1", "/path/to/file2"] }
```
Response: `{ "deleted": 2, "failed": 0 }`

### Hardlink Files
```
POST /api/files/hardlink
{ "source_paths": ["/src/file1"], "target_paths": ["/dst/file1"] }
```
Response: `{ "hardlinked": 1, "skipped": 0, "failed": 0, "errors": [] }`

For each pair:
1. If the target already exists, it is removed first.
2. `std::fs::hard_link(source, target)` is called.

---

## 13. Frontend ([`web/`](../czkawka_web/web))

### 13.1 Architecture

The frontend is a **vanilla JavaScript single-page application** (~1107 lines in [`app.js`](../czkawka_web/web/app.js)).

**No build tools, no framework, no bundler.** Files are served directly via `rust-embed`.

### 13.2 HTML Structure ([`index.html`](../czkawka_web/web/index.html:1))

- **Header** with tool navigation tabs.
- **Settings panel** (left side): included/excluded directory lists with add/remove/browse controls, scan options (recursive, cache, min size, tool-specific options), Scan/Stop buttons, progress bar.
- **Results panel** (right side): summary text, scrollable results table with pagination, action buttons (Delete Selected, Hardlink Selected, Hide linked files).
- **Folder browser modal** (overlay): navigable directory tree with path input, entry list, select button.
- **Status bar** at the bottom.

### 13.3 App State ([`STATE` object](../czkawka_web/web/app.js:9))

Key state fields:
| Field | Description |
|-------|-------------|
| `activeTool` | Currently selected tool object |
| `includedPaths` / `excludedPaths` | Directory lists for scanning |
| `scanId` | Current scan UUID |
| `ws` | Active WebSocket connection |
| `scanning` | Whether a scan is in progress |
| `summary` / `groups` | Current scan results |
| `sourceMap` | Per-group hardlink source file mapping |
| `linkedPaths` | Set of paths that are already hardlinked |
| `resultsCache` | Cached results per tool (enables switching tools without re-scanning) |
| `pageSize` / `currentPage` / `totalPages` | Pagination state |
| `_fileIndex` | Flat array of all file entries (for pagination & action lookups) |

### 13.4 Tools

Three tools are defined in the [`TOOLS` array](../czkawka_web/web/app.js:3):

| id | Name | Endpoint | Features |
|----|------|----------|----------|
| `duplicates` | Duplicate Files | `/api/scan/duplicates` | Hash/Size/Name/SizeName checking, case-sensitive toggle |
| `images` | Similar Images | `/api/scan/similar-images` | Max difference, hash size, hash algorithm, thumbnail previews |
| `videos` | Similar Videos | `/api/scan/similar-videos` | Tolerance, skip forward, hash duration, crop detect, thumbnails |

### 13.5 Scan Flow

1. User clicks **Scan** → [`startScan()`](../czkawka_web/web/app.js:203) builds the request body with tool-specific options.
2. `fetch()` POST to the tool's endpoint → receives `{ scan_id, status }`.
3. [`connectWebSocket()`](../czkawka_web/web/app.js:277) opens a WebSocket to `/api/scan/progress/{scan_id}`.
4. WebSocket receives `progress` messages → updates progress bar.
5. WebSocket receives `completed` message → calls [`fetchResults()`](../czkawka_web/web/app.js:343).
6. [`fetchResults()`](../czkawka_web/web/app.js:343) GETs `/api/results/{scan_id}` → populates `summary` and `groups`.
7. [`detectHardlinksInResults()`](../czkawka_web/web/app.js:318) scans all groups for files sharing the same inode → populates `linkedPaths`.
8. Results are rendered in the table via [`renderResults()`](../czkawka_web/web/app.js:421).

### 13.6 Results Table

The table is rendered dynamically with:
- **Group header rows** — show group index, similarity percentage (images/videos), or file count/size (duplicates). Include a linked-file count when applicable.
- **File rows** — checkbox, path (with optional thumbnail preview for images/videos), inode, size, modified date (duplicates), hash preview (duplicates with Hash method), similarity (images/videos), duration/codec/fps/resolution (videos).
- **Action column** — per-file "Set as source" / "★ Source" / "Hardlink to source" buttons.
- **Pagination** — configurable page size (25/50/100/200/500), prev/next buttons, direct page input.
- **Select-all** checkbox in the table header (with event delegation).
- **Already-linked** files are dimmed and tagged with a "(Linked)" badge.

### 13.7 Hardlink Workflow

1. User clicks **"Set as source"** for one file per group → stored in `sourceMap`.
2. For other files in the same group, a **"Hardlink to source"** button appears.
3. Clicking it calls [`performHardlink()`](../czkawka_web/web/app.js:782) — POSTs to `/api/files/hardlink`.
4. Alternatively, select multiple files and click **"Hardlink Selected"** (bulk operation via [`hardlinkSelected()`](../czkawka_web/web/app.js:820])).
5. Successfully hardlinked paths are added to `linkedPaths` and the table re-renders with dimmed rows.

### 13.8 Delete Workflow

1. Check files in the table → click **"Delete Selected"** → confirmation dialog → [`deleteSelected()`](../czkawka_web/web/app.js:900).
2. POSTs to `/api/files/delete`.
3. Removes deleted files from the local groups array and re-renders.
4. If all files in a group are deleted, the entire group is removed.

### 13.9 Folder Browser

The folder browser modal ([`openFolderBrowser()`](../czkawka_web/web/app.js:964)):
1. Reads the current value from the target path input (included or excluded).
2. Fetches `/api/browse?path=...` to list directory contents.
3. Displays directories and files with click-to-navigate on directories.
4. "Select This Folder" button adds the current path to the appropriate directory list.
5. Supports keyboard navigation (Enter to navigate, Escape to close).

### 13.10 Styling

[`style.css`](../czkawka_web/web/style.css) implements a **dark theme**:
- Background: `#1a1a2e` (deep navy)
- Headers: `#16213e`
- Accent: `#e94560` (coral red — scan buttons, active tabs, progress bar)
- Secondary: `#0f3460` (muted blue — nav buttons, directory items, table rows)
- Text: `#eee` / `#8892b0` / `#a8b2d1`
- Modal overlay with centered folder browser dialog.

### 13.11 app.js.bak — Work-in-Progress Features

[`app.js.bak`](../czkawka_web/web/app.js.bak) is a 1370-line version that contains **unused/unmerged enhancements** over the current [`app.js`](../czkawka_web/web/app.js):

| Feature | Description | Lines in .bak |
|---------|-------------|---------------|
| **Sortable Columns** | Click column headers to sort results by path, size, similarity, duration, codec, FPS, resolution. Asc/desc/none cycling. | 39–61, 519–556, 856–923 |
| **Gallery View** | For similar-images, toggle between table and visual gallery grid of image thumbnails with selection. | 1107–1190 |
| **Recent Directories** | Stores last 20 directories in `localStorage`, dropdown with recent paths, clear button. | 25, 241–307, 1356–1358 |
| **`escAttr()` helper** | Proper HTML attribute escaping (separate from `escHtml`). | 1198–1202 |
| **`_selection` Set** | Shared selection state (used by both list and gallery views). | 35, 118, 645–650, 819–829, 966–968, 1092 |

The current `app.js` uses a simpler selection mechanism (reading checkbox state directly from the DOM) and has no sorting, gallery mode, or recent directories.

---

## 14. Docker Setup

### 14.1 Dockerfile ([`Dockerfile`](../czkawka_web/Dockerfile:1))

**Multi-stage build:**

**Stage 1 — Builder (`rust:alpine`):**
1. Installs `musl-dev` for static linking.
2. Copies Cargo manifests and lockfile first (Docker layer caching).
3. Creates dummy source files and builds dependencies.
4. Copies real source code and performs a release build.
5. Strips debug symbols from the binary.

**Stage 2 — Runtime (`alpine:3.21`):**
1. Installs `shadow` (for user management) and `ffmpeg` (for video features).
2. Copies the compiled binary and an entrypoint script.
3. The entrypoint script creates a `czkawka` user matching `PUID`/`PGID` env vars (defaults: 1000:1000).
4. Creates `/data` and `/scan_folder` directories owned by the `czkawka` user.
5. Drops privileges and runs the binary via `su`.

**Exposed port:** 8095

### 14.2 Docker Compose ([`docker-compose.yml`](../czkawka_web/docker-compose.yml:1))

```yaml
services:
  czkawka-web:
    build:
      context: ..
      dockerfile: czkawka_web/Dockerfile
    ports:
      - "8095:8095"
    environment:
      - CZKAWKA_ADDRESS=0.0.0.0
      - CZKAWKA_PORT=8095
      - PUID=${PUID:-1000}
      - PGID=${PGID:-1000}
    volumes:
      - ./data:/data:rw
      - ./scan_folder:/scan_folder:rw
    restart: unless-stopped
```

The compose file mounts `./data` and `./scan_folder` as scan directories. PUID/PGID can be set via environment variables or `.env` file.

### 14.3 Build Commands (from `README.md`)

```bash
# Via justfile
just build-web     # build
just run-web       # debug run
just runr-web      # fast_release run
just docker-web    # Docker build

# Manual
cargo build --release --bin czkawka_web
docker build -t czkawka_web -f czkawka_web/Dockerfile .
```

---

## 15. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| **Directory traversal** | [`handle_browse`](../czkawka_web/src/api/browse.rs:26) rejects paths containing `..`. |
| **CORS** | [`CorsLayer::permissive()`](../czkawka_web/src/main.rs:86) accepts all origins — should be locked down in production behind a reverse proxy. |
| **File deletion** | [`delete_files`](../czkawka_web/src/api/actions.rs:21) accepts arbitrary paths. The web UI is intended for local/trusted-network use only (like other Czkawka frontends). No authentication is implemented. |
| **No authentication** | The server has no auth layer. It's designed for local use or behind a VPN/reverse proxy. |
| **Privilege separation** | Docker entrypoint drops privileges to a non-root user matching `PUID`/`PGID`. |
| **XSS** | The frontend uses [`escHtml()`](../czkawka_web/web/app.js:958) for HTML escaping. File paths from the server are escaped before rendering. Note: `app.js` uses `escHtml` for both body and attribute contexts (the `.bak` version adds a dedicated `escAttr()` for attributes). |

---

## 16. Tools NOT Available via Web

Compared to the full Czkawka toolset, the web interface does **not** expose:
- Empty files / Empty folders
- Big files
- Same music (audio tags / content)
- Broken files
- Bad extensions / Bad names
- Invalid symlinks
- Temporary files
- EXIF remover
- Video optimizer

These tools are available in the desktop UIs (krokiet, czkawka_gui) and CLI.

---

## 17. Summary

`czkawka_web` provides a lightweight, self-contained web interface for three core Czkawka tools (duplicates, similar images, similar videos). Key design decisions:

1. **Single binary** — frontend embedded via `rust-embed`, no runtime files.
2. **REST + WebSocket** — async initiation, streaming progress, synchronous result retrieval.
3. **std::thread for scanners** — Czkawka's scanning tools are CPU-bound and blocking; they run on dedicated OS threads with crossbeam→tokio progress bridging.
4. **Vanilla JS frontend** — no framework overhead, no build step, easily auditable.
5. **Paginated results** — handles large scan results without overwhelming the browser.
6. **Hardlink workflow** — set source files per group, hardlink duplicates to save space.
7. **Docker support** — multi-stage build, privilege separation, ffmpeg for video features.
8. **Local-only deployment** — no authentication, permissive CORS, designed for trusted networks.
