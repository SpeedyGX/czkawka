# syntax=docker/dockerfile:1
# Multi-stage build for czkawka_web
#
# Build stage:  rust:alpine compiles the binary with embedded web assets.
# Runtime stage: scratch (empty) image contains only the single binary.

# ======================================================
# Stage 1: Builder
# ======================================================
FROM rust:alpine AS builder

RUN apk add --no-cache musl-dev

WORKDIR /app

# Copy manifests and lockfile first to maximise Docker layer caching.
COPY Cargo.toml Cargo.lock ./
COPY czkawka_core/Cargo.toml czkawka_core/
COPY czkawka_web/Cargo.toml czkawka_web/

# Create dummy source files so `cargo build` resolves and caches dependencies.
RUN mkdir -p czkawka_core/src czkawka_web/src czkawka_web/web \
    && echo "fn main() {}" > czkawka_core/src/lib.rs \
    && echo "fn main() {}" > czkawka_web/src/main.rs \
    && echo "" > czkawka_web/web/index.html \
    && echo "" > czkawka_web/web/style.css \
    && echo "" > czkawka_web/web/app.js

# Build dependencies only (this layer is cached unless Cargo.toml/Cargo.lock changes).
RUN cargo build --package czkawka_web --release 2>/dev/null || true

# Now copy the real source code.
COPY czkawka_core/src czkawka_core/src/
COPY czkawka_web/ czkawka_web/

# Force a rebuild of the actual crate code (dummy sources are stale).
RUN touch czkawka_web/src/main.rs czkawka_core/src/lib.rs

# Build the actual binary with embedded frontend files.
RUN cargo build --package czkawka_web --release

# Strip debug symbols to minimise binary size.
RUN strip /app/target/release/czkawka_web

# ======================================================
# Stage 2: Runtime
# ======================================================
FROM scratch

COPY --from=builder /app/target/release/czkawka_web /czkawka_web

# The server binds to 127.0.0.1:8095 by default.
# Override with CZKAWKA_PORT env var at runtime (not via ENV in scratch,
# but via `docker run -e CZKAWKA_PORT=...`).
EXPOSE 8095

ENTRYPOINT ["/czkawka_web"]
