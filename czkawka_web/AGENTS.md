# czkawka_web – Architecture Guide

## Purpose

`czkawka_web` is a lightweight, self-contained web frontend for Czkawka: a standalone HTTP server
(axum + tokio) whose HTML/CSS/JS assets are embedded at compile time via `rust-embed`, so there are
no external files, bundler, or runtime deployment. It ships two frontends over one REST/WebSocket
API — the modern ES-module UI at `/` (the default entry point and the default target for new work) and
the classic vanilla-JS UI at `/classic/`.

It exposes 4 scan tools — Duplicates (Hash/Name/Size/SizeName), Hardlink scanning, Similar Images
and Similar Videos — plus file actions (delete, hardlink, OS open/reveal), raw file streaming,
previews and WebSocket progress.

---

## Ownership

Owned by the `czkawka_web` crate at the same level as the other Czkawka frontends. Accepts changes
to all files under [`czkawka_web/`](.).

---

## Local Contracts

- **Modern UI first:** frontend work targets the modern ES-module UI at [`web/v2/`](web/v2/) by
  default. The classic UI ([`web/index.html`](web/index.html), [`web/app.js`](web/app.js),
  [`web/style.css`](web/style.css)) is maintenance-only and is changed only when the user explicitly
  asks for it.
- **Trust model — localhost, no auth:** binds to `127.0.0.1:8095` by default (override with
  `CZKAWKA_ADDRESS` / `CZKAWKA_PORT`); CORS is permissive. To expose it externally, put a reverse
  proxy in front — do not bind `0.0.0.0` without accepting that there is no authentication layer.
  `GET /api/file/{name}` (any readable path after rejecting `..`) and `POST /api/files/open` inherit
  this trust model.
- **Depends on [`czkawka_core`](../czkawka_core/)** for all scanning logic; `axum` 0.8 + `tokio` 1
  (full) for HTTP/WebSocket; `rust-embed` to bake [`web/`](web/) into the binary; `tower-http` for
  CORS; `uuid` for scan session IDs.
- **No external database** — scan state lives in memory only (per-scan UUID → `ScanState`).
- **Max 2 concurrent scans** (`Arc<Semaphore>`); a third request gets HTTP 429.
- **Limited tool set:** only the 4 tools above are wired; other `czkawka_core` tools are not exposed.
- **Scan option surface:** Similar Images exposes `hash_size` (`8`/`16`/`32`/`64`, default `16`) plus
  Krokiet-named controls — **Resize Algorithm** (`resize_filter`, default `Lanczos3`), **Hash Type**
  (`hash_alg`, default `Mean`; `Mean`/`Gradient`/`BlockHash`/`VertGradient`/`DoubleGradient`/
  `Median`) and **Geometric invariance** (`geometric_invariance`: `off`/`mirror_flip`/
  `mirror_flip_rotate90`, default `off`). Similar Videos exposes frame-hash options and an optional
  audio-fingerprint mode (`check_audio_content`) with audio similarity/length-ratio/min-duration/
  max-difference parameters, and reports `mode: "visual" | "audio"`. Numeric options are clamped to
  `czkawka_core` ranges so a bad request cannot trip a worker-thread assertion.
- **Hardlink semantics:** `POST /api/files/hardlink` takes `{ source_paths, target_paths }` pairs —
  the **source** is the kept file, the **target** is removed and recreated as a hardlink to it
  (`std::fs::hard_link(source, target)`; never the reverse). The frontend records the per-group
  source in `sourceMap`.

---

## Architecture

### Source Layout

```
czkawka_web/src/
├── main.rs              # Tokio main, router, terminal auto-launch
├── embedded.rs          # Static file serving (rust-embed + MIME mappings)
├── scan_manager.rs      # ScanManager + ScanState + ScanStatus
├── ws.rs                # WebSocket progress handler
└── api/
    ├── mod.rs
    ├── scan.rs          # run_scan() generic + 4 scan endpoints + serializers
    ├── actions.rs       # POST /api/files/delete + /api/files/hardlink
    ├── file.rs          # GET /api/file/{name} (streaming) + POST /api/files/open (OS open/reveal)
    ├── results.rs       # GET /api/results/{scan_id}
    ├── preview.rs       # GET /api/preview/image + /api/preview/video
    ├── browse.rs        # GET /api/browse (file browser)
    └── health.rs        # GET /api/health
```

### API Endpoints

This table is the **single source of truth** for the HTTP surface. [`README.md`](README.md) and
[`docs/07-czkawka-web.md`](../docs/07-czkawka-web.md) link here instead of copying it.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scan/duplicates` | Scan for duplicate files (Hash/Name/Size/SizeName) |
| POST | `/api/scan/hardlink` | Scan + replace duplicates with hardlinks |
| POST | `/api/scan/similar-images` | Scan for similar images (perceptual hash; selectable resize filter) |
| POST | `/api/scan/similar-videos` | Scan for similar videos (frame hashing, or audio fingerprint when `check_audio_content`) |
| POST | `/api/scan/stop` | Stop a running scan by ID |
| GET | `/api/results/{scan_id}` | Get scan results as JSON |
| GET | `/api/scan/progress/{scan_id}` | WebSocket upgrade — real-time progress |
| GET | `/api/preview/image?path=...` | Image thumbnail preview |
| GET | `/api/preview/video?path=...` | Video thumbnail preview |
| GET | `/api/file/{name}?path=...` | Stream a file inline (`{name}` is a cosmetic segment used as the browser tab title) |
| POST | `/api/files/delete` | Delete files by path |
| POST | `/api/files/hardlink` | Create hardlinks (source→target pairs) |
| POST | `/api/files/open` | Open a file or reveal its folder with the OS default app (same machine only) |
| GET | `/api/browse` | Browse filesystem (file picker) |
| GET | `/api/health` | Health check |

**Endpoint semantics**

- **`GET /api/file/{name}?path=...`** — `{name}` is purely cosmetic (the browser uses the last URL
  segment as the tab title); the real path comes from `path`. `..` components and directories → `400`,
  a missing file → `404`. Hand-rolled MIME map, `Content-Disposition: inline`, `Accept-Ranges: bytes`.
  Single-range: `bytes=start-end` / `bytes=start-` / `bytes=-suffix` → `206` + `Content-Range`; an
  unsatisfiable range → `416` + `Content-Range: bytes */total`; no `Range` → `200` full body. The
  body streams in 64 KiB chunks, so a multi-GB video is never buffered.
- **`POST /api/files/open`** — `{ "path": "...", "mode": "file" | "folder" }` →
  `{ "opened": bool, "error": Option<String> }`; `mode` defaults to `"folder"` (reveals the containing
  folder, selecting the file where supported), `"file"` opens it with the OS default app. The opener
  is a **fixed program invoked with the path as an argument — never a shell string** (`xdg-open`;
  `open`/`open -R`; `cmd /C start`/`explorer /select,`). **Same machine only:** it acts on the
  *server's* desktop session, so it does nothing useful in Docker or over the network; spawn
  failures return `200` with `opened: false` and an actionable `error`, **never a `5xx`**.
- **`POST /api/files/delete`** deletes by path; **`POST /api/files/hardlink`** removes each target and
  links it to the matching source. Both are for local/trusted use only.

### Scan lifecycle (`run_scan()`)

All 4 scan endpoints delegate to `run_scan()` in [`src/api/scan.rs`](src/api/scan.rs): acquire a
semaphore permit (429 if none) → `ScanManager::create_scan()` → bridge a
`crossbeam_channel::Receiver<ProgressData>` to a `broadcast::Sender<ProgressData>` on a relay thread →
spawn a `std::thread` worker that runs the tool closure inside `catch_unwind` and calls
`finish_scan()` via the stored tokio handle (panics become `ScanStatus::Failed`) → reply immediately
with `{ "scan_id": "...", "status": "started" }`.

`ScanManager` ([`src/scan_manager.rs`](src/scan_manager.rs)) holds a
`Mutex<HashMap<String, ScanState>>`. A `ScanState` carries the `ScanStatus`
(`Running`/`Completed`/`Stopped`/`Failed(String)`), an `Arc<AtomicBool>` stop flag, a 256-capacity
`broadcast::Sender<ProgressData>`, and the serialized result. `AppState`
([`src/api/scan.rs`](src/api/scan.rs)) adds a stored `tokio::runtime::Handle` so worker threads can
update scan state from outside the async runtime.

### Progress forwarding & WebSocket

```
worker thread → crossbeam Sender<ProgressData>
  → relay std::thread → tokio broadcast::Sender (256)
    → WebSocket task → browser (JSON ~every 200 ms)
```

[`src/ws.rs`](src/ws.rs) upgrades `GET /api/scan/progress/{scan_id}` and `tokio::select!`s progress
events, a 200 ms interval that polls `ScanManager::get_status()` (a fallback for a status set after
the broadcast closes), and `socket.recv()` for disconnects. On close it emits a final
`{ "type": "completed", "status": "..." }`; `RecvError::Lagged` is logged and ignored.

### Frontend

Both frontends are embedded uncompressed and cross-link to each other:

- **Modern UI** at `/` (also reachable at `/v2/`): [`web/v2/index.html`](web/v2/index.html),
  [`web/v2/style.css`](web/v2/style.css), and ES modules in [`web/v2/js/`](web/v2/js/) (`app` entry,
  `store`, `api`, `util`, `ui`, `tools`, `dirs`, `results`, `scan`, `actions`, `open`).
- **Classic UI** at `/classic/`: [`web/index.html`](web/index.html), [`web/app.js`](web/app.js) (single
  vanilla script), [`web/style.css`](web/style.css).

The modern shell uses root-absolute asset URLs (`/v2/style.css`, `/v2/js/app.js`) so it renders
identically at `/` and `/v2/`; relative URLs would resolve against `/` and hit the classic stylesheet.

Modern-UI behaviour contracts:

- Clicking a path/thumbnail opens the file: browser-viewable types (images, `mp4`/`webm`, `pdf`/text)
  go to a new tab via `/api/file/{name}`; everything else is handed to the OS via `/api/files/open`.
  There is deliberately **no Download button** — the server is local.
- Files sharing an inode (including the source) are faded with a `Linked` badge in both list and
  gallery view. The linked filter is three-state: `All` / `Hide linked` / `Linked only`.
- A hardlink **never** drops results: a fully linked group stays listed and is hidden only by the
  `Hide linked` filter, so `Linked only` keeps showing what was just linked. Only *empty* groups (all
  files deleted) are removed.
- `actions.js` reconciles group-indexed state (`sourceMap`, selection, cached snapshot) through one
  helper, `commitGroupChange()`. **Row selection is deliberately cleared after an action** — do not
  "optimise" this away.

`src/embedded.rs` derives `RustEmbed` and serves via the fallback route: any path not matching an API
route resolves to an embedded file, and a directory-like path resolves to its `index.html`
(`/` → `v2/index.html`, the modern UI; `/classic/` → `index.html`, the classic UI, whose assets stay
at the `web/` root and are served under the `classic/` prefix). Neither UI needs a bundler.

Without a terminal attached, the process re-executes itself in a terminal emulator (trying
`x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `lxterminal`, `xterm`) and
warns if none is found.

---

## Work Guidance

### Adding a scan endpoint

1. Add a request struct + handler + serializer in [`src/api/scan.rs`](src/api/scan.rs): parse the
   request → build tool params → call `run_scan()` with a closure that configures the tool, calls
   `search()`, then returns `(ScanStatus, Option<Value>)`.
2. Add the route in [`src/main.rs`](src/main.rs).
3. Update the **modern UI** ([`web/v2/`](web/v2/)) — the classic [`web/app.js`](web/app.js) only on
   explicit request.
4. Rebuild — no separate frontend build step.

### Adding static files

1. Place the file under [`web/`](web/) (e.g. `web/v2/js/`) — sub-directories are embedded and served
   automatically.
2. Add a MIME mapping in [`src/embedded.rs`](src/embedded.rs) if the extension is new.
3. **Force a rebuild.** `rust-embed` re-embeds on recompilation, but Cargo may not notice a newly
   added file on a plain incremental rebuild — run `touch czkawka_web/src/embedded.rs` (or
   `cargo clean -p czkawka_web`).

---

## Verification

- `cargo fmt` / `cargo clippy` on the `czkawka_web` crate (via `just fix`).
- WebSocket progress streaming is tested manually against the browser frontend.
- No dedicated integration test suite yet.

---

## Child DOX Index

None (leaf node — no sub-directories are durable boundaries).
