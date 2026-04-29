#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Try release build first, then fast_release
BINARY=""
if [ -f "$REPO_DIR/target/release/czkawka_web" ]; then
    BINARY="$REPO_DIR/target/release/czkawka_web"
elif [ -f "$REPO_DIR/target/fast_release/czkawka_web" ]; then
    BINARY="$REPO_DIR/target/fast_release/czkawka_web"
fi

if [ -z "$BINARY" ]; then
    echo "czkawka_web binary not found."
    echo "Build it first: cd '$REPO_DIR' && cargo build --release --bin czkawka_web"
    echo "Or use: just runr-web"
    echo ""
    read -r -p "Press Enter to exit..."
    exit 1
fi

echo "Starting czkawka_web on http://127.0.0.1:8095"
echo "Press Ctrl+C to stop the server."
echo ""
exec "$BINARY"
