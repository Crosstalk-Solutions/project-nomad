#!/usr/bin/env bash
# RhinoVault: add the public-domain U.S. military field manuals to the AI Knowledge Base.
#
# Downloads the Internet Archive collection "military-field-manuals-and-guides" (~2 GB of PDFs),
# places the PDFs in the Knowledge Base upload folder, and asks RhinoVault to index them so the
# AI Assistant can answer from them (e.g. "how do I purify water without a filter?").
#
# Usage:
#   sudo bash add-field-manuals.sh                    # all manuals
#   sudo bash add-field-manuals.sh --only 'surviv|first.aid|land.nav|water|shelter|sanitation'
#   sudo bash add-field-manuals.sh --from /path/to/military-field-manuals.zip   # use a local copy
#
# Options:
#   --storage DIR   RhinoVault storage path (default: $NOMAD_STORAGE_PATH or /opt/project-nomad/storage)
#   --url URL       Command Center URL used to trigger indexing (default: http://localhost:8080)
#   --only REGEX    Only add manuals whose file name matches REGEX (case-insensitive)
#   --from FILE     Use an already-downloaded zip instead of downloading
set -euo pipefail

STORAGE="${NOMAD_STORAGE_PATH:-/opt/project-nomad/storage}"
URL="http://localhost:8080"
ONLY=""
FROM=""
ARCHIVE_URL='https://archive.org/compress/military-field-manuals-and-guides/formats=TEXT%20PDF,IMAGE%20CONTAINER%20PDF'

while [ $# -gt 0 ]; do
  case "$1" in
    --storage) STORAGE="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    --from) FROM="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

DEST="$STORAGE/kb_uploads/field-manuals"
if [ ! -d "$STORAGE" ]; then
  echo "RhinoVault storage folder not found: $STORAGE (use --storage)"; exit 1
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
ZIP="$FROM"
if [ -z "$ZIP" ]; then
  ZIP="$TMP/military-field-manuals.zip"
  echo "Downloading field manuals from the Internet Archive (~2 GB, resumable)..."
  curl -L --fail --retry 5 --retry-delay 10 -C - -o "$ZIP" "$ARCHIVE_URL"
fi

echo "Unpacking..."
mkdir -p "$TMP/x"
if command -v unzip >/dev/null 2>&1; then
  unzip -q -o "$ZIP" -d "$TMP/x"
else
  python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$ZIP" "$TMP/x"
fi

mkdir -p "$DEST"
added=0; skipped=0
while IFS= read -r -d '' f; do
  name="$(basename "$f")"
  if [ -n "$ONLY" ] && ! printf '%s' "$name" | grep -qiE "$ONLY"; then skipped=$((skipped+1)); continue; fi
  if [ -f "$DEST/$name" ]; then skipped=$((skipped+1)); continue; fi
  cp "$f" "$DEST/$name"; added=$((added+1))
done < <(find "$TMP/x" -type f -iname '*.pdf' -print0)
echo "Added $added manual(s) to $DEST ($skipped skipped)."

echo "Asking RhinoVault to index the new files..."
if curl -sS --fail -X POST "$URL/api/rag/sync" -o "$TMP/sync.json"; then
  echo "Indexing started: $(cat "$TMP/sync.json")"
  echo "Progress shows in the Command Center under AI Assistant > Knowledge Base."
  echo "Indexing ~180 manuals can take a few hours on a CPU-only machine; the AI can be used meanwhile."
else
  echo "Could not reach $URL. Open the Command Center > Knowledge Base and click 'Sync Storage' to index the manuals."
fi
