#!/usr/bin/env bash
# Native screenshot smoke test.
#
# Builds the desktop client, runs it with DODGEBALL_SCREENSHOT, waits for the
# PNG and then stops the process. Requires a working display/GPU; wrap it in
# `xvfb-run -a` on a headless machine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="${1:-$ROOT/dist/native-smoke.png}"
TIMEOUT="${SMOKE_TIMEOUT:-30}"
BIN="$ROOT/target/debug/dodgeball"

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"

cargo build -p dodgeball-client-desktop
DODGEBALL_SCREENSHOT="$OUT" DODGEBALL_AUTOSTART="${DODGEBALL_AUTOSTART:-0}" \
  "$BIN" > "$ROOT/target/native-smoke.log" 2>&1 &
PID=$!

for _ in $(seq 1 "$TIMEOUT"); do
  if [ -s "$OUT" ]; then
    break
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true

if [ ! -s "$OUT" ]; then
  echo "native smoke test failed: no screenshot at $OUT" >&2
  tail -n 40 "$ROOT/target/native-smoke.log" >&2 || true
  exit 1
fi

echo "native smoke test passed: $OUT"
