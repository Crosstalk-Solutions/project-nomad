#!/usr/bin/env bash
# Download all PDFs and resources from install/nomad-data-pdf-urls.txt into NOMAD-DATA.
# Usage: ./install/download-nomad-data-pdfs.sh [TARGET_DIR]
#   TARGET_DIR defaults to ./NOMAD-DATA or $NOMAD_DATA_PATH
# Requires: wget or curl

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="${SCRIPT_DIR}/nomad-data-pdf-urls.txt"
TARGET="${1:-${NOMAD_DATA_PATH:-$REPO_ROOT/NOMAD-DATA}}"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Manifest not found: $MANIFEST"
  exit 1
fi

mkdir -p "$TARGET"
cd "$TARGET"

if command -v wget &>/dev/null; then
  GET="wget"
  GET_OPTS=(--no-check-certificate -q --show-progress -N)
elif command -v curl &>/dev/null; then
  GET="curl"
  GET_OPTS=(-fSL -o)
else
  echo "Need wget or curl."
  exit 1
fi

count=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="$(echo "$line" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  [[ -z "$line" ]] && continue
  subdir="${line%%[[:space:]]*}"
  url="$(echo "${line#*[[:space:]]}" | sed 's/^[[:space:]]*//')"
  [[ -z "$url" || "$url" == "$subdir" ]] && continue
  dir="$TARGET/$subdir"
  mkdir -p "$dir"
  raw_name=$(basename "$(echo "$url" | sed 's/?.*//')")
  filename=$(echo "$raw_name" | sed 's/%20/_/g; s/%2B/+/g')
  [[ -z "$filename" ]] && filename="doc_$(echo "$url" | sha256sum 2>/dev/null | cut -c1-12).pdf"
  if [[ "$GET" == "wget" ]]; then
    (cd "$dir" && wget "${GET_OPTS[@]}" -O "$filename" "$url") || true
  else
    (cd "$dir" && curl -fSL -o "$filename" "$url") || true
  fi
  ((count++)) || true
done < "$MANIFEST"

echo "Done. Downloaded/updated up to $count files under $TARGET"
