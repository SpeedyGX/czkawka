# czkawka_web — Web GUI for Czkawka

A lightweight web interface for the Czkawka file-cleaning tools. It runs as a standalone HTTP
server with the frontend embedded in the binary via `rust-embed` — no external files are needed at
runtime. It ships a modern UI (ES modules, design tokens, light/dark theme, responsive layout) at
`/` — the default entry point — and the classic UI at `/classic/`.

## Quick Start

### From source

```bash
# Build (from the workspace root)
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

Open [http://127.0.0.1:8095](http://127.0.0.1:8095) (modern UI, the default) or
[http://127.0.0.1:8095/classic/](http://127.0.0.1:8095/classic/) (classic UI) in your browser.

### Using Docker

```bash
# Build the image
just docker-web

# Or manually:
docker build -t czkawka_web -f czkawka_web/Dockerfile .
docker run -p 8095:8095 --rm czkawka_web
```

In Docker (and any remote/headless setup) scanning and previews work, but the **"Open"** /
**"Show in folder"** actions cannot: they launch programs on the machine running the server, so they
need a local desktop session. The server is **localhost-only and unauthenticated** — keep it on your
own machine or behind a reverse proxy.

## Configuration

| Environment variable | Default     | Description                  |
|----------------------|-------------|------------------------------|
| `CZKAWKA_ADDRESS`    | `127.0.0.1` | Bind address                 |
| `CZKAWKA_PORT`       | `8095`      | TCP port for the HTTP server |

## API

The HTTP/WebSocket API is documented once, in the crate contract:
[`AGENTS.md` → API Endpoints](AGENTS.md#api-endpoints).

Scan entry points are `POST /api/scan/duplicates`, `POST /api/scan/hardlink`, and the
similar-images / similar-videos endpoints; progress streams over
`GET /api/scan/progress/{scan_id}` (WebSocket).

## Docker Compose

A [`docker-compose.yml`](docker-compose.yml) is provided for building and running the service:

```bash
docker compose -f czkawka_web/docker-compose.yml build
docker compose -f czkawka_web/docker-compose.yml up       # add -d for detached mode
docker compose -f czkawka_web/docker-compose.yml down
```

## Development

Both frontends live in [`web/`](web/) and are embedded at compile time — no bundler or build step.
Frontend work targets the modern UI ([`web/v2/`](web/v2/)) by default; the classic UI is
maintenance-only. See the crate contract ([`AGENTS.md`](AGENTS.md)) for source layout, adding new
static files, and the full API reference, and [`docs/07-czkawka-web.md`](../docs/07-czkawka-web.md)
for the architecture narrative.
