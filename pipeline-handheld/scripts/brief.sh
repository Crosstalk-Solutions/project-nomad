#!/usr/bin/env bash
# =============================================================================
# BRIEF — Interactive brief writer
# Writes your idea to brief.txt then optionally kicks off the Scope Agent
# =============================================================================

set -euo pipefail

PIPELINE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRIEF_FILE="$PIPELINE_DIR/brief.txt"

echo ""
echo "=== EMERGENCY BOOTSTRAP BRIEF ==="
echo "Describe the emergency-runtime slice you want to build."
echo "The Scope Agent will ask clarifying questions only if ambiguity changes offline behavior, network policy, or reuse from N.O.M.A.D."
echo ""
echo "Type your brief (multi-line). Press CTRL+D when done."
echo "---"

# Read multi-line input
BRIEF=""
while IFS= read -r line; do
  BRIEF+="$line"$'\n'
done

if [[ -z "${BRIEF// /}" ]]; then
  echo "Empty brief. Aborted."
  exit 1
fi

echo "$BRIEF" > "$BRIEF_FILE"
echo "---"
echo "Brief saved to: $BRIEF_FILE"
echo ""

read -p "Run Scope Agent now? [y/N] " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  "$PIPELINE_DIR/scripts/router.sh" scope "$BRIEF_FILE"
fi
