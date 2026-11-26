#!/usr/bin/env bash
# Package the native desktop binary for the current OS.
#
# Linux:   tar.gz with the binary, .desktop entry, icon and README.
# macOS:   unsigned Dodgeball.app wrapped in a zip.
# Windows: zip with the executable, icon and README.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/desktop}"
OS="${PACKAGE_OS:-$(uname -s)}"
VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' "$ROOT/Cargo.toml" | head -n1)"

mkdir -p "$OUT"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

case "$OS" in
  Linux*)
    BIN="${BIN:-$ROOT/target/release/dodgeball}"
    if [ ! -x "$BIN" ]; then
      echo "missing release binary: $BIN" >&2
      exit 1
    fi
    DIR="$STAGE/dodgeball-linux-$VERSION"
    mkdir -p "$DIR"
    cp "$BIN" "$DIR/dodgeball"
    cp "$ROOT/packaging/linux/dodgeball.desktop" "$DIR/dodgeball.desktop"
    cp "$ROOT/packaging/dodgeball.svg" "$DIR/dodgeball.svg"
    cp "$ROOT/README.md" "$DIR/README.md"
    cp "$ROOT/LICENSE" "$DIR/LICENSE"
    chmod +x "$DIR/dodgeball"
    tar -czf "$OUT/dodgeball-linux-$VERSION.tar.gz" \
      -C "$STAGE" "dodgeball-linux-$VERSION"
    echo "$OUT/dodgeball-linux-$VERSION.tar.gz"
    ;;

  Darwin*)
    BIN="${BIN:-$ROOT/target/release/dodgeball}"
    if [ ! -x "$BIN" ]; then
      echo "missing release binary: $BIN" >&2
      exit 1
    fi
    APP="$STAGE/Dodgeball.app"
    mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
    cp "$BIN" "$APP/Contents/MacOS/dodgeball"
    chmod +x "$APP/Contents/MacOS/dodgeball"
    cp "$ROOT/packaging/dodgeball.svg" "$APP/Contents/Resources/dodgeball.svg"
    cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Dodgeball Simulator</string>
  <key>CFBundleDisplayName</key><string>Dodgeball Simulator</string>
  <key>CFBundleIdentifier</key><string>com.waynevanson.dodgeball</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleExecutable</key><string>dodgeball</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
EOF
    cp "$ROOT/README.md" "$STAGE/README.md"
    cp "$ROOT/LICENSE" "$STAGE/LICENSE"
    # The app is unsigned; users open it once via right-click > Open.
    (cd "$STAGE" && zip -qry "$OUT/dodgeball-macos-$VERSION.zip" Dodgeball.app README.md LICENSE)
    echo "$OUT/dodgeball-macos-$VERSION.zip"
    ;;

  MINGW*|MSYS*|CYGWIN*|Windows*)
    BIN="${BIN:-$ROOT/target/release/dodgeball.exe}"
    if [ ! -f "$BIN" ]; then
      echo "missing release binary: $BIN" >&2
      exit 1
    fi
    DIR="$STAGE/dodgeball-windows-$VERSION"
    mkdir -p "$DIR"
    cp "$BIN" "$DIR/dodgeball.exe"
    cp "$ROOT/packaging/dodgeball.svg" "$DIR/dodgeball.svg"
    cp "$ROOT/README.md" "$DIR/README.md"
    cp "$ROOT/LICENSE" "$DIR/LICENSE"
    WIN_DIR="$(cygpath -w "$DIR" 2>/dev/null || echo "$DIR")"
    WIN_OUT="$(cygpath -w "$OUT/dodgeball-windows-$VERSION.zip" 2>/dev/null || echo "$OUT/dodgeball-windows-$VERSION.zip")"
    powershell.exe -NoProfile -Command \
      "Compress-Archive -LiteralPath '$WIN_DIR' -DestinationPath '$WIN_OUT' -Force"
    echo "$OUT/dodgeball-windows-$VERSION.zip"
    ;;

  *)
    echo "unsupported OS: $OS" >&2
    exit 1
    ;;
esac
