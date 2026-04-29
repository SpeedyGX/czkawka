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
COPY czkawka_cli/Cargo.toml czkawka_cli/
COPY czkawka_gui/Cargo.toml czkawka_gui/
COPY czkawka_web/Cargo.toml czkawka_web/
COPY cedinia/Cargo.toml cedinia/
COPY krokiet/Cargo.toml krokiet/

# Copy the real build.rs, i18n config, and translation files so the build script
# and i18n-embed / rust-embed proc macros work correctly from the start.
COPY czkawka_core/build.rs czkawka_core/
COPY czkawka_core/i18n.toml czkawka_core/
COPY czkawka_core/i18n czkawka_core/i18n/

# Create dummy source files so `cargo build` resolves and caches dependencies.
# Every workspace member needs at least one source target (src/main.rs or src/lib.rs)
# so Cargo can parse its manifest. The actual sources are copied in later.
RUN mkdir -p czkawka_core/src czkawka_core/benches czkawka_cli/src czkawka_gui/src czkawka_web/src czkawka_web/web cedinia/src krokiet/src \
    && echo "fn main() {}" > czkawka_core/src/lib.rs \
    && echo "" > czkawka_core/benches/hash_calculation_benchmark.rs \
    && echo "fn main() {}" > czkawka_cli/src/main.rs \
    && echo "fn main() {}" > czkawka_gui/src/main.rs \
    && echo "fn main() {}" > czkawka_web/src/main.rs \
    && echo "" > cedinia/src/lib.rs \
    && echo "fn main() {}" > krokiet/src/main.rs \
    && echo "" > czkawka_web/web/index.html \
    && echo "" > czkawka_web/web/style.css \
    && echo "" > czkawka_web/web/app.js

# Build dependencies only (this layer is cached unless Cargo.toml/Cargo.lock changes).
RUN cargo build --package czkawka_web --release 2>/dev/null || true

# Now copy the real source code (build.rs, i18n files are already in place).
COPY czkawka_core/src czkawka_core/src/
COPY czkawka_web/ czkawka_web/

# Force a rebuild of the actual crate code (dummy sources are stale).
RUN touch czkawka_web/src/main.rs czkawka_core/src/lib.rs

# Build the actual binary with embedded frontend files.
RUN cargo build --package czkawka_web --release

# Strip debug symbols to minimise binary size.
RUN strip /app/target/release/czkawka_web

# ======================================================
# Stage 2: Runtime (Alpine-based for non-root user support)
# ======================================================
FROM alpine:3.21

# Runtime dependencies: shadow for user management, ffmpeg for video features
# (thumbnails, similar videos, video optimisation).
RUN apk add --no-cache shadow ffmpeg

COPY --from=builder /app/target/release/czkawka_web /czkawka_web

# Default UID/GID – override with PUID/PGID env vars at runtime.
ENV PUID=1000 PGID=1000

# Entrypoint script creates a user matching PUID/PGID, then drops privileges.
COPY <<"EOF" /entrypoint.sh
#!/bin/sh
set -e

# Remove existing czkawka user/group if they exist (from a previous run).
id czkawka >/dev/null 2>&1 && deluser czkawka || true
getent group czkawka >/dev/null 2>&1 && delgroup czkawka || true

# Create group and user with the requested IDs.
addgroup -g "$PGID" czkawka
adduser -D -h /data -u "$PUID" -G czkawka czkawka

# Ensure the data/scan directories exist and are owned by czkawka.
mkdir -p /data
chown czkawka:czkawka /data
mkdir -p /scan_folder
chown czkawka:czkawka /scan_folder

# Drop privileges and run the web server.
exec su czkawka -c "/czkawka_web $*"
EOF

RUN chmod +x /entrypoint.sh

# The server binds to 127.0.0.1:8095 by default.
# Override with CZKAWKA_ADDRESS / CZKAWKA_PORT env vars at runtime.
EXPOSE 8095

VOLUME /data

ENTRYPOINT ["/entrypoint.sh"]
