# czkawka_web — Web Interface

**Crate:** [`czkawka_web/`](../czkawka_web) ·
**Entry point:** [`src/main.rs`](../czkawka_web/src/main.rs) ·
**Frontends:** classic at [`web/`](../czkawka_web/web), modern at [`web/v2/`](../czkawka_web/web/v2)

---

## 1. Overview

`czkawka_web` is a standalone HTTP server that exposes a subset of Czkawka's scanning tools through
a browser single-page application. The entire frontend is embedded at compile time via
[`rust-embed`](https://crates.io/crates/rust-embed), so the single binary is fully self-contained —
no external static files or bundler are needed at runtime.

**Shape:** REST + WebSocket.

- Scan *initiation* is an HTTP `POST` that returns a `scan_id`.
- Scan *progress* is streamed over `GET /api/scan/progress/{scan_id}` (WebSocket).
- Completed *results* are fetched over HTTP `GET /api/results/{scan_id}`.
- *File actions* (delete, hardlink, OS open/reveal) are HTTP `POST` requests.

The complete endpoint table and its semantics live in the crate contract:
[`czkawka_web/AGENTS.md` → API Endpoints](../czkawka_web/AGENTS.md#api-endpoints).

---

## 2. Architecture

### Scan lifecycle

The web layer reuses `czkawka_core`'s blocking, CPU-bound scanning tools. Every scan endpoint feeds
one shared generic helper, `run_scan()` ([`src/api/scan.rs`](../czkawka_web/src/api/scan.rs)):

1. Acquire a permit from an `Arc<Semaphore>` — at most 2 concurrent scans; a third request gets
   HTTP 429.
2. `ScanManager::create_scan()` mints a UUID `scan_id`, a `stop_flag`, and a progress receiver.
3. A relay thread copies `ProgressData` from a `crossbeam_channel` receiver into a tokio
   `broadcast::Sender`, bridging the scanner thread back to the async runtime.
4. A `std::thread` worker configures the tool, calls `search()`, and — inside `catch_unwind` —
   reports the terminal `ScanStatus` (`Running` / `Completed` / `Stopped` / `Failed`) and the JSON
   result through the manager. A panic is captured and turned into `Failed`.
5. The handler returns immediately with `{ "scan_id": ..., "status": "started" }`.

`ScanManager` ([`src/scan_manager.rs`](../czkawka_web/src/scan_manager.rs)) keeps a
`Mutex<HashMap<String, ScanState>>`; each `ScanState` holds the status, the stop flag, the progress
broadcast channel, and the serialized result. `AppState`
([`src/api/scan.rs`](../czkawka_web/src/api/scan.rs)) stores the manager plus a
`tokio::runtime::Handle`, so worker threads can update scan state from outside the async runtime.

### Progress forwarding

```
worker thread → crossbeam Sender<ProgressData>
  → relay std::thread → tokio broadcast::Sender (capacity 256)
    → WebSocket task → browser (JSON ~every 200 ms)
```

The WebSocket handler ([`src/ws.rs`](../czkawka_web/src/ws.rs)) multiplexes the broadcast receiver, a
200 ms status-poll interval (a fallback for a status set after the broadcast closes), and the client
socket via `tokio::select!`. When the broadcast closes it emits a final
`{ "type": "completed", "status": "..." }`.

### Static embedding and routing

[`src/embedded.rs`](../czkawka_web/src/embedded.rs) derives `RustEmbed` over `web/` and serves any
path that does not match an API route. A directory-like path resolves to its `index.html`
(`/` → `v2/index.html`, the modern UI; `/classic/` → `index.html`, the classic UI, served under the
`classic/` prefix while its files stay at the `web/` root). MIME types are mapped by hand (`.html`,
`.js`, `.css`, `.svg`, `.png`; unknown → `application/octet-stream`).

[`src/main.rs`](../czkawka_web/src/main.rs) builds the axum router and applies a permissive CORS
layer. When launched without a terminal, the process re-executes itself inside a terminal emulator
(`x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `lxterminal`, `xterm`),
warning and continuing if none is found.

---

## 3. Frontend

Two no-framework frontends share the same API and are embedded uncompressed:

- **Modern UI** at `/` (also `/v2/`) — ES modules (no bundler), design tokens with
  `prefers-color-scheme` plus a manual auto/dark/light toggle, and a responsive grid layout. Modules:
  `app` (entry), `store`, `api`, `util`, `ui`, `tools`, `dirs`, `results`, `scan`, `actions`, `open`.
- **Classic UI** at `/classic/` — a single vanilla [`app.js`](../czkawka_web/web/app.js) with a dark
  theme.

Modern-UI UX highlights:

- A segmented list/gallery view, toast notifications, promise-based confirm dialogs, and empty states.
- Clicking a path or thumbnail opens the file: browser-viewable types go to a new tab via
  `/api/file/{name}`, everything else is handed to the OS via `/api/files/open`. There is
  intentionally **no Download button** — the server is local.
- Hardlink UX: the linked source is chosen per group (`sourceMap`); files sharing an inode —
  **including the source** — are faded and badged `Linked` in both views, with a three-state filter
  (`All` / `Hide linked` / `Linked only`). A hardlink never removes results from the list, and the
  row selection is deliberately cleared after an action.

Frontend work targets the modern UI by default; the classic UI is maintenance-only (see the crate
contract).

---

## 4. Trust model and security

The server is **localhost-only and unauthenticated** by default (binds `127.0.0.1:8095`). It is meant
for the user's own machine or a trusted network behind a reverse proxy or VPN; do not expose it
directly. CORS is permissive, which is only acceptable under that same assumption.

- **Path traversal** — the file browser and the streaming endpoint reject `..` components.
- **OS open/reveal** — runs in the *server's* desktop session, so it does nothing useful in Docker or
  over the network, and never returns a `5xx` (spawn failures come back as `200` with
  `opened: false`).
- **XSS** — file paths are escaped before rendering: the classic UI uses `escHtml()` / `escAttr()` in
  [`app.js`](../czkawka_web/web/app.js); the modern UI builds DOM nodes with `textContent` via
  [`el()`](../czkawka_web/web/v2/js/util.js) instead of string HTML.
- **Docker** — the entrypoint drops privileges to a non-root `czkawka` user matching `PUID` / `PGID`.

---

## 5. Tool coverage

Exposed: Duplicates (Hash/Name/Size/SizeName), Hardlink, Similar Images, Similar Videos.

Not exposed (available in the desktop UIs and CLI): empty files/folders, big files, same music,
broken files, bad extensions/names, invalid symlinks, temporary files, EXIF remover, video optimizer.

---

## 6. Docker

[`Dockerfile`](../czkawka_web/Dockerfile) is a multi-stage build — a `rust:alpine` builder producing
a static musl binary (stripped) and an `alpine` runtime carrying the binary, `ffmpeg` for video
features, and a small entrypoint that prepares `/data` and `/scan_folder` and drops privileges.
[`docker-compose.yml`](../czkawka_web/docker-compose.yml) mounts those directories and sets
`CZKAWKA_ADDRESS=0.0.0.0` inside the container. See
[`README.md`](../czkawka_web/README.md) for the build/run commands.

---

## 7. References

- Crate contract: [`czkawka_web/AGENTS.md`](../czkawka_web/AGENTS.md) — endpoint table and semantics,
  source layout, work guidance, verification.
- User quick start: [`czkawka_web/README.md`](../czkawka_web/README.md).
