#!/usr/bin/env bash
#
# finalize-release-notes.sh
#
# Stamps the "## Unreleased" section in a release-notes file with a version
# and date, and extracts the section content for use in GitHub releases / email.
#
# Usage:  finalize-release-notes.sh <version> <file-path>
#
# Exit codes:
#   0 - Success: section stamped and extracted
#   1 - No "## Unreleased" section found (skip gracefully)
#   2 - Unreleased section exists but is empty (skip gracefully)

set -euo pipefail

VERSION="${1:?Usage: finalize-release-notes.sh <version> <file-path>}"
FILE="${2:?Usage: finalize-release-notes.sh <version> <file-path>}"

if [[ ! -f "$FILE" ]]; then
  echo "Error: File not found: $FILE" >&2
  exit 1
fi

# Find the line number of the ## Unreleased header (case-insensitive)
HEADER_LINE=$(grep -inm1 '^## unreleased' "$FILE" | cut -d: -f1)

if [[ -z "$HEADER_LINE" ]]; then
  echo "No '## Unreleased' section found. Skipping."
  exit 1
fi

TOTAL_LINES=$(wc -l < "$FILE")

# Find the next section header (## Version ...) or --- separator after the Unreleased header
NEXT_SECTION_LINE=""
if [[ $HEADER_LINE -lt $TOTAL_LINES ]]; then
  NEXT_SECTION_LINE=$(tail -n +"$((HEADER_LINE + 1))" "$FILE" \
    | grep -nm1 '^## \|^---$' \
    | cut -d: -f1)
fi

if [[ -n "$NEXT_SECTION_LINE" ]]; then
  # NEXT_SECTION_LINE is relative to HEADER_LINE+1, convert to absolute
  END_LINE=$((HEADER_LINE + NEXT_SECTION_LINE - 1))
else
  # Section runs to end of file
  END_LINE=$TOTAL_LINES
fi

# Extract content between header and next section (exclusive of both boundaries)
CONTENT_START=$((HEADER_LINE + 1))
CONTENT_END=$END_LINE

# Extract the section body (between header line and the next boundary)
SECTION_BODY=$(sed -n "${CONTENT_START},${CONTENT_END}p" "$FILE" | sed '/^$/N;/^\n$/d')

# Check for actual content: strip blank lines and lines that are only markdown headers (###...)
TRIMMED=$(echo "$SECTION_BODY" | sed '/^[[:space:]]*$/d')
HAS_CONTENT=$(echo "$SECTION_BODY" | sed '/^[[:space:]]*$/d' | grep -v '^###' || true)

if [[ -z "$TRIMMED" || -z "$HAS_CONTENT" ]]; then
  echo "Unreleased section is empty. Skipping."
  exit 2
fi

# Format the date as "Month Day, Year"
DATE_STAMP=$(date +'%B %-d, %Y')
NEW_HEADER="## Version ${VERSION} - ${DATE_STAMP}"

# Build the replacement: swap the header line, keep everything else intact
{
  # Lines before the Unreleased header
  if [[ $HEADER_LINE -gt 1 ]]; then
    head -n "$((HEADER_LINE - 1))" "$FILE"
  fi
  # New versioned header
  echo "$NEW_HEADER"
  # Content between header and next section
  sed -n "${CONTENT_START},${CONTENT_END}p" "$FILE"
  # Rest of the file after the section
  if [[ $END_LINE -lt $TOTAL_LINES ]]; then
    tail -n +"$((END_LINE + 1))" "$FILE"
  fi
} > "${FILE}.tmp"

mv "${FILE}.tmp" "$FILE"

# Write the extracted section content (for GitHub release body / future email)
{
  echo "$NEW_HEADER"
  echo ""
  echo "$TRIMMED"
} > "${FILE}.section"

echo "Finalized release notes for v${VERSION}"
echo "  Updated: ${FILE}"
echo "  Extracted: ${FILE}.section"
exit 0
