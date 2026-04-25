# czkawka_web — Web GUI for Czkawka

A lightweight web-based interface for the Czkawka file cleaning tools. Runs as a
standalone HTTP server with an embedded frontend — no external files needed at runtime.

## Quick Start

### From source

```bash
# Build (from workspace root)
cargo build --release --bin czkawka_web

# Run
cargo run --release --bin czkawka_web
```

Or using `just`:

```bash
just build-web
just run-web       # debug profile
just runr-web      # fast_release profile
```

Open [http://127.0.0.1:8095](http://127.0.0.1:8095) in your browser.

### Using Docker

```bash
# Build the image
just docker-web

# Or manually:
docker build -t czkawka_web -f czkawka_web/Dockerfile .

# Run
docker run -p 8095:8095 --rm czkawka_web
```

## Configuration

| Environment variable | Default | Description                  |
|----------------------|---------|------------------------------|
| `CZKAWKA_PORT`       | `8095`  | TCP port for the HTTP server |

The server binds to `127.0.0.1` by default. To change the address, modify the
`SocketAddr` in [`src/main.rs`](src/main.rs) or set a reverse proxy (e.g. nginx,
Caddy) in front of it.

## API Endpoints

| Method | Path                           | Description               |
|--------|--------------------------------|---------------------------|
| POST   | `/api/scan/duplicates`         | Scan for duplicate files  |
| POST   | `/api/scan/similar-images`     | Scan for similar images   |
| POST   | `/api/scan/similar-videos`     | Scan for similar videos   |
| GET    | `/api/preview/image?path=...`  | Image thumbnail preview   |
| GET    | `/api/preview/video?path=...`  | Video thumbnail preview   |
| GET    | `/api/results/{scan_id}`       | Get scan results          |
| GET    | `/api/scan/progress/{scan_id}` | WebSocket progress stream |
| POST   | `/api/files/delete`            | Delete selected files     |
| POST   | `/api/files/hardlink`          | Hard-link selected files  |

## Development

### Frontend

The frontend is a vanilla JS single-page application in [`web/`](web/):

- [`web/index.html`](web/index.html) — main page structure
- [`web/app.js`](web/app.js) — application logic
- [`web/style.css`](web/style.css) — dark theme styles

To rebuild the binary after frontend changes:

```bash
cargo build --release --bin czkawka_web
```

No bundler or build step is needed — the files are embedded at compile time via
[`rust-embed`](https://crates.io/crates/rust-embed).

### Adding new static files

1. Place the file in [`czkawka_web/web/`](web/).
2. Add a MIME type mapping in [`src/embedded.rs`](src/embedded.rs) if the extension is new.
3. Rebuild the binary.

## Project Structure

```
czkawka_web/
├── Cargo.toml           # Crate manifest
├── Dockerfile           # Multi-stage Docker build
├── README.md            # This file
├── src/
│   ├── main.rs          # Server setup, routing
│   ├── embedded.rs      # Static file embedding (rust-embed)
│   ├── scan_manager.rs  # Scan lifecycle management
│   ├── ws.rs            # WebSocket progress handler
│   └── api/
│       ├── mod.rs
│       ├── actions.rs   # File delete/hardlink
│       ├── preview.rs   # Image/video previews
│       ├── results.rs   # Scan result retrieval
│       └── scan.rs      # Scan initiation
└── web/
    ├── index.html       # Frontend HTML
    ├── app.js           # Frontend JS
    └── style.css        # Frontend CSS
```
