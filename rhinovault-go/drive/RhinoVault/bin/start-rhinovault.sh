#!/usr/bin/env bash
# RhinoVault Go start script for macOS and Linux.
# Usage: start-rhinovault.sh [--share] [--no-browser]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SHARE=0; BROWSER=1
for a in "$@"; do
  case "$a" in
    --share) SHARE=1 ;;
    --no-browser) BROWSER=0 ;;
  esac
done

OS="$(uname -s)"; ARCH="$(uname -m)"
case "$OS" in
  Darwin) if [ "$ARCH" = "arm64" ]; then PLAT=mac-arm64; else PLAT=mac-x64; fi ;;
  Linux)  PLAT=linux-x64 ;;
  *) echo "Unsupported system: $OS"; exit 1 ;;
esac
BIN="$HERE/$PLAT"
# Apple Silicon can run Intel builds through Rosetta if no arm64 build is on the drive.
if [ "$PLAT" = "mac-arm64" ] && [ ! -x "$BIN/kiwix-serve" ] && [ -f "$HERE/mac-x64/kiwix-serve" ]; then KBIN="$HERE/mac-x64"; else KBIN="$BIN"; fi

echo ""
echo "  =============================================="
echo "     RhinoVault Go  -  offline survival library"
echo "  =============================================="
echo ""

if [ "$OS" = "Darwin" ]; then
  # Files copied from the internet are quarantined by Gatekeeper; clear it for our tools only.
  xattr -dr com.apple.quarantine "$BIN" "$KBIN" 2>/dev/null || true
fi
chmod +x "$BIN"/* "$KBIN"/* 2>/dev/null || true

for f in "$BIN/static-web-server" "$KBIN/kiwix-serve"; do
  if [ ! -f "$f" ]; then echo "  Missing $f - rebuild this drive with Build-RhinoVaultGo.ps1"; exit 1; fi
done

port_free() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
free_port() { local p=$1; while ! port_free "$p"; do p=$((p+1)); done; echo "$p"; }
WEB_PORT=$(free_port 8088)
LIB_PORT=$(free_port 8090)
ADDR=127.0.0.1; [ "$SHARE" = 1 ] && ADDR=0.0.0.0
LOG="${TMPDIR:-/tmp}/rhinovault-go"; mkdir -p "$LOG"

PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; echo "  RhinoVault stopped."; }
trap cleanup EXIT INT TERM

shopt -s nullglob
ZIMS=("$ROOT/Library/ZIM/"*.zim)
if [ ${#ZIMS[@]} -gt 0 ]; then
  echo "  Starting library (${#ZIMS[@]} collections)..."
  KARGS=(--port="$LIB_PORT" --blockexternal --nodatealiases --attachToProcess=$$)
  [ "$SHARE" = 0 ] && KARGS+=(--address="$ADDR")
  "$KBIN/kiwix-serve" "${KARGS[@]}" "${ZIMS[@]}" >"$LOG/kiwix.log" 2>&1 &
  PIDS+=($!)
else
  echo "  No library collections found on this drive."
fi

echo "  Starting launcher..."
"$BIN/static-web-server" --host "$ADDR" --port "$WEB_PORT" --root "$ROOT" \
  --directory-listing true --cache-control-headers false --log-level warn >"$LOG/web.log" 2>&1 &
PIDS+=($!)

sleep 2
for p in "${PIDS[@]}"; do
  if ! kill -0 "$p" 2>/dev/null; then echo "  A RhinoVault service stopped unexpectedly. Logs: $LOG"; exit 1; fi
done

URL="http://127.0.0.1:$WEB_PORT/RhinoVault/launcher/?kiwix=$LIB_PORT"
echo ""
echo "  RhinoVault is running:  $URL"
if [ "$SHARE" = 1 ]; then
  for ip in $( (hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null) ); do
    echo "  On other devices:       http://$ip:$WEB_PORT/RhinoVault/launcher/?kiwix=$LIB_PORT"
  done
fi
if [ "$BROWSER" = 1 ]; then
  if [ "$OS" = "Darwin" ]; then open "$URL"; else (xdg-open "$URL" >/dev/null 2>&1 &); fi
fi
echo ""
if [ -t 0 ]; then
  read -r -p "  Press Enter to stop RhinoVault (then eject the drive safely) " _
else
  wait
fi
