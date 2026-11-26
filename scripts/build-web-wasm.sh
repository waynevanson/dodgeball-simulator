#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WASM_BINDGEN="${WASM_BINDGEN:-wasm-bindgen}"
OUT_DIR="${OUT_DIR:-apps/web/src/wasm}"
PROFILE="${PROFILE:-release}"
# Cargo calls the default profile `dev` but writes it to `debug/`.
PROFILE_DIR="$PROFILE"
if [ "$PROFILE" = "dev" ]; then
  PROFILE_DIR="debug"
fi
TARGET_DIR="${CARGO_TARGET_DIR:-target}"
WASM="$TARGET_DIR/wasm32-unknown-unknown/$PROFILE_DIR/dodgeball_client_web.wasm"

cargo build -p dodgeball-client-web --target wasm32-unknown-unknown --profile "$PROFILE"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
"$WASM_BINDGEN" --target web --out-dir "$OUT_DIR" --out-name dodgeball_client "$WASM"

if command -v wasm-opt >/dev/null 2>&1; then
  wasm-opt -Oz --strip-debug \
    --enable-bulk-memory --enable-nontrapping-float-to-int \
    "$OUT_DIR/dodgeball_client_bg.wasm" \
    -o "$OUT_DIR/dodgeball_client_bg.wasm.opt"
  mv "$OUT_DIR/dodgeball_client_bg.wasm.opt" "$OUT_DIR/dodgeball_client_bg.wasm"
fi

ls -lh "$OUT_DIR/dodgeball_client_bg.wasm"
