#!/usr/bin/env bash
# =============================================================================
# EMERGENCY BOOTSTRAP ROUTER
# Project-specific agent network with shared safety rails.
# =============================================================================

set -euo pipefail

PIPELINE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$PIPELINE_DIR/state"
STATUS_FILE="$STATE_DIR/status.json"
SAFETY_FILE="$PIPELINE_DIR/SAFETY.md"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[router]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

ensure_state_dirs() {
  mkdir -p "$STATE_DIR/slices" "$STATE_DIR/outputs"
}

get_phase() {
  python3 -c "import json; print(json.load(open('$STATUS_FILE'))['phase'])"
}

get_phase_status() {
  local phase="$1"
  python3 -c "import json; print(json.load(open('$STATUS_FILE'))['phases'].get('$phase', 'pending'))"
}

update_status() {
  local phase="$1"
  local status="$2"
  python3 -c "
import json
from datetime import datetime
with open('$STATUS_FILE', 'r') as f:
    state = json.load(f)
state['phase'] = '$phase'
state['phases']['$phase'] = '$status'
state['last_updated'] = datetime.now().isoformat()
with open('$STATUS_FILE', 'w') as f:
    json.dump(state, f, indent=2)
"
}

update_slice() {
  local name="$1"
  local status="$2"
  local error="${3:-}"
  local attempts_delta="${4:-0}"
  python3 -c "
import json
from datetime import datetime
with open('$STATUS_FILE', 'r') as f:
    state = json.load(f)
slice_info = state.setdefault('slices', {}).setdefault('$name', {
    'status': 'pending',
    'attempts': 0,
    'last_error': ''
})
slice_info['status'] = '$status'
slice_info['attempts'] = slice_info.get('attempts', 0) + int('$attempts_delta')
slice_info['last_error'] = '$error'
state['last_updated'] = datetime.now().isoformat()
with open('$STATUS_FILE', 'w') as f:
    json.dump(state, f, indent=2)
"
}

get_slices() {
  python3 -c "
import json
state = json.load(open('$STATUS_FILE'))
for name, info in state.get('slices', {}).items():
    print(f\"{name}:{info.get('status', 'pending')}\")
"
}

run_agent() {
  local agent_name="$1"
  local agent_md="$2"
  local input_file="$3"
  local output_file="$4"
  local system_prompt

  log "Running $agent_name..."
  log "  System: $agent_md"
  log "  Input:  $input_file"
  log "  Output: $output_file"

  [[ -f "$agent_md" ]] || fail "Agent file not found: $agent_md"
  [[ -f "$input_file" ]] || fail "Input file not found: $input_file"

  if [[ -f "$SAFETY_FILE" ]]; then
    system_prompt="$(cat "$SAFETY_FILE")"$'\n\n'"$(cat "$agent_md")"
  else
    system_prompt="$(cat "$agent_md")"
  fi

  claude -p --system-prompt "$system_prompt" "$(cat "$input_file")" > "$output_file"

  if [[ -s "$output_file" ]]; then
    ok "$agent_name completed → $output_file"
  else
    fail "$agent_name produced empty output"
  fi
}

markdown_status() {
  local delivery_file="$1"
  python3 -c "
from pathlib import Path
import yaml

path = Path('$delivery_file')
text = path.read_text(encoding='utf-8') if path.exists() else ''
status = 'blocked'
if text.startswith('---\\n'):
    end = text.find('\\n---\\n', 4)
    if end != -1:
        meta = yaml.safe_load(text[4:end]) or {}
        status = meta.get('status', status)
print(status)
" 2>/dev/null || echo "blocked"
}

yaml_status() {
  local file="$1"
  local key="${2:-status}"
  python3 -c "
import yaml
from pathlib import Path

path = Path('$file')
value = 'failed'
if path.exists():
    data = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
    value = data.get('$key', value)
print(value)
" 2>/dev/null || echo "failed"
}

sync_project_name_from_yaml() {
  local file="$1"
  python3 -c "
import json
from pathlib import Path
import yaml

status_path = Path('$STATUS_FILE')
data_path = Path('$file')

with open(status_path, 'r') as f:
    state = json.load(f)

if data_path.exists():
    data = yaml.safe_load(data_path.read_text(encoding='utf-8')) or {}
    project_name = data.get('project_name', '').strip()
    if project_name:
        state['project_name'] = project_name

with open(status_path, 'w') as f:
    json.dump(state, f, indent=2)
"
}

seed_slices_from_seams() {
  ensure_state_dirs
  python3 -c "
import json
import re
from pathlib import Path
import yaml

status_path = Path('$STATUS_FILE')
seams_path = Path('$STATE_DIR/seams.yaml')
slices_dir = Path('$STATE_DIR/slices')

with open(status_path, 'r') as f:
    state = json.load(f)

with open(seams_path, 'r') as f:
    seams = yaml.safe_load(f) or {}

slices = seams.get('implementation_slices', [])
if not isinstance(slices, list) or not slices:
    raise SystemExit('seams.yaml does not contain implementation_slices')

project_name = seams.get('project_name', '').strip()
if project_name:
    state['project_name'] = project_name

for item in slices:
    raw_name = str(item.get('name', '')).strip()
    if not raw_name:
        continue
    slice_id = re.sub(r'[^a-zA-Z0-9._-]+', '-', raw_name).strip('-').lower()
    if not slice_id:
        continue
    manifest_path = slices_dir / f'{slice_id}.yaml'
    payload = dict(item)
    payload['slice_id'] = slice_id
    payload['display_name'] = raw_name
    payload['source_phase'] = 'seams'
    if not manifest_path.exists():
        manifest_path.write_text(yaml.safe_dump(payload, sort_keys=False), encoding='utf-8')
    info = state.setdefault('slices', {}).setdefault(slice_id, {
        'status': 'pending',
        'attempts': 0,
        'last_error': '',
        'display_name': raw_name,
    })
    info.setdefault('display_name', raw_name)

with open(status_path, 'w') as f:
    json.dump(state, f, indent=2)
"
}

emergency_context_file() {
  local file="$STATE_DIR/emergency_context.md"
  {
    if [[ -f "$PIPELINE_DIR/../docs/emergency/README.md" ]]; then
      echo "# Emergency Profile"
      cat "$PIPELINE_DIR/../docs/emergency/README.md"
      echo
    fi
    if [[ -f "$PIPELINE_DIR/../docs/emergency/ARCHITECTURE.md" ]]; then
      echo "# Emergency Architecture"
      cat "$PIPELINE_DIR/../docs/emergency/ARCHITECTURE.md"
      echo
    fi
    if [[ -f "$PIPELINE_DIR/../docs/emergency/LOCAL_API.md" ]]; then
      echo "# Local API"
      cat "$PIPELINE_DIR/../docs/emergency/LOCAL_API.md"
      echo
    fi
    if [[ -f "$PIPELINE_DIR/../docs/emergency/SEAM_MAP.md" ]]; then
      echo "# Seam Map"
      cat "$PIPELINE_DIR/../docs/emergency/SEAM_MAP.md"
      echo
    fi
    if [[ -f "$PIPELINE_DIR/../docs/emergency/COLLECTIONS_SEAM.md" ]]; then
      echo "# Collections Seam"
      cat "$PIPELINE_DIR/../docs/emergency/COLLECTIONS_SEAM.md"
      echo
    fi
  } > "$file"
  printf '%s\n' "$file"
}

seams_input_file() {
  local file="$STATE_DIR/seams_input.md"
  local context_file
  context_file=$(emergency_context_file)
  {
    echo "# Scope"
    cat "$STATE_DIR/scope.yaml"
    echo
    echo "# Emergency Docs"
    cat "$context_file"
  } > "$file"
  printf '%s\n' "$file"
}

build_input_for_slice() {
  local slice="$1"
  local file="$STATE_DIR/build_input_${slice}.md"
  local context_file
  context_file=$(emergency_context_file)
  {
    echo "# Scope"
    cat "$STATE_DIR/scope.yaml"
    echo
    echo "# Seams"
    cat "$STATE_DIR/seams.yaml"
    echo
    echo "# Slice Manifest"
    cat "$STATE_DIR/slices/${slice}.yaml"
    echo
    echo "# Emergency Docs"
    cat "$context_file"
  } > "$file"
  printf '%s\n' "$file"
}

verify_input_file() {
  local file="$STATE_DIR/verify_input.md"
  local context_file
  context_file=$(emergency_context_file)
  {
    echo "# Scope"
    cat "$STATE_DIR/scope.yaml"
    echo
    echo "# Seams"
    cat "$STATE_DIR/seams.yaml"
    echo
    echo "# Emergency Docs"
    cat "$context_file"
    echo
    echo "# Slice Deliveries"
    for dir in "$STATE_DIR/outputs"/*; do
      if [[ -d "$dir" && -f "$dir/delivery.md" ]]; then
        echo
        echo "## $(basename "$dir")"
        cat "$dir/delivery.md"
      fi
    done
  } > "$file"
}

repair_input_for_slice() {
  local slice="$1"
  local file="$STATE_DIR/repair_input_${slice}.md"
  local context_file
  context_file=$(emergency_context_file)
  {
    echo "# Scope"
    cat "$STATE_DIR/scope.yaml"
    echo
    echo "# Seams"
    cat "$STATE_DIR/seams.yaml"
    echo
    echo "# Slice Manifest"
    cat "$STATE_DIR/slices/${slice}.yaml"
    echo
    echo "# Verification"
    cat "$STATE_DIR/verification.yaml"
    echo
    echo "# Current Delivery"
    cat "$STATE_DIR/outputs/${slice}/delivery.md"
    echo
    echo "# Emergency Docs"
    cat "$context_file"
  } > "$file"
  printf '%s\n' "$file"
}

finalize_build_phase() {
  local result
  result=$(python3 -c "
import json
state = json.load(open('$STATUS_FILE'))
slices = state.get('slices', {})
if not slices:
    print('failed')
else:
    statuses = {info.get('status', 'pending') for info in slices.values()}
    if statuses <= {'built', 'patched'}:
        print('done')
    elif 'building' in statuses or 'pending' in statuses:
        print('in_progress')
    else:
        print('failed')
")

  case "$result" in
    done)
      update_status "build" "done"
      ok "Build phase complete"
      ;;
    in_progress)
      update_status "build" "in_progress"
      warn "Build phase still in progress"
      ;;
    *)
      update_status "build" "failed"
      warn "Build phase has blocked slices"
      ;;
  esac
}

run_scope() {
  local brief="$1"
  [[ -f "$brief" ]] || fail "Brief file required. Usage: ./router.sh scope <brief.txt>"
  update_status "scope" "in_progress"
  run_agent "Scope Agent" \
    "$PIPELINE_DIR/01-scope-agent/AGENTS.md" \
    "$brief" \
    "$STATE_DIR/scope.yaml"
  sync_project_name_from_yaml "$STATE_DIR/scope.yaml"
  update_status "scope" "done"
}

run_seams() {
  local input_file
  input_file=$(seams_input_file)
  update_status "seams" "in_progress"
  run_agent "Seam Agent" \
    "$PIPELINE_DIR/02-seam-agent/AGENTS.md" \
    "$input_file" \
    "$STATE_DIR/seams.yaml"
  sync_project_name_from_yaml "$STATE_DIR/seams.yaml"
  seed_slices_from_seams
  update_status "seams" "done"
  rm -f "$input_file"
}

run_build() {
  local slice="$1"
  [[ -n "$slice" ]] || fail "Slice name required. Usage: ./router.sh build <slice-name>"

  local manifest="$STATE_DIR/slices/${slice}.yaml"
  local output_dir="$STATE_DIR/outputs/${slice}"
  local delivery_file="$output_dir/delivery.md"
  local input_file

  [[ -f "$manifest" ]] || fail "Slice manifest not found: $manifest"

  ensure_state_dirs
  mkdir -p "$output_dir"
  update_status "build" "in_progress"
  update_slice "$slice" "building" "" "1"

  input_file=$(build_input_for_slice "$slice")
  run_agent "Runtime Agent" \
    "$PIPELINE_DIR/03-runtime-agent/AGENTS.md" \
    "$input_file" \
    "$delivery_file"

  local delivery_status
  delivery_status=$(markdown_status "$delivery_file")

  case "$delivery_status" in
    built)
      update_slice "$slice" "built"
      ok "$slice built"
      ;;
    *)
      update_slice "$slice" "blocked" "build_blocked"
      warn "$slice blocked — review delivery bundle"
      ;;
  esac

  rm -f "$input_file"
}

run_build_all() {
  update_status "build" "in_progress"
  seed_slices_from_seams
  log "Building all pending slices..."
  while IFS=: read -r name status; do
    if [[ "$status" == "pending" || "$status" == "failed" || "$status" == "blocked" ]]; then
      run_build "$name"
    else
      log "Skipping $name (status: $status)"
    fi
  done <<< "$(get_slices)"
  finalize_build_phase
}

run_verify() {
  update_status "verify" "in_progress"
  verify_input_file
  run_agent "Verify Agent" \
    "$PIPELINE_DIR/04-verify-agent/AGENTS.md" \
    "$STATE_DIR/verify_input.md" \
    "$STATE_DIR/verification.yaml"

  local verification_status
  verification_status=$(yaml_status "$STATE_DIR/verification.yaml")
  case "$verification_status" in
    green)
      update_status "verify" "done"
      ok "Verification green — ready for apply or ship review"
      ;;
    yellow)
      update_status "verify" "done"
      warn "Verification yellow — bounded review remains"
      ;;
    *)
      update_status "verify" "failed"
      warn "Verification red — repair or upstream rethink required"
      ;;
  esac
}

run_repair() {
  local slice="$1"
  [[ -n "$slice" ]] || fail "Slice name required. Usage: ./router.sh repair <slice-name>"

  local delivery_file="$STATE_DIR/outputs/${slice}/delivery.md"
  local input_file

  [[ -f "$delivery_file" ]] || fail "Delivery not found for slice: $slice"

  update_status "repair" "in_progress"
  update_slice "$slice" "fixing" "" "1"

  input_file=$(repair_input_for_slice "$slice")
  run_agent "Repair Agent" \
    "$PIPELINE_DIR/05-repair-agent/AGENTS.md" \
    "$input_file" \
    "$delivery_file"

  local delivery_status
  delivery_status=$(markdown_status "$delivery_file")
  case "$delivery_status" in
    patched|built)
      update_slice "$slice" "patched"
      update_status "repair" "done"
      ok "$slice patched — re-run verify"
      ;;
    *)
      update_slice "$slice" "blocked" "repair_blocked"
      update_status "repair" "failed"
      warn "$slice remains blocked — review delivery bundle"
      ;;
  esac

  rm -f "$input_file"
}

show_status() {
  python3 "$PIPELINE_DIR/scripts/status.py"
}

usage() {
  echo "Usage: ./router.sh <command> [args]"
  echo
  echo "Commands:"
  echo "  scope <brief.txt>     Run Scope Agent on a brief"
  echo "  seams                 Run Seam Agent on scope.yaml + emergency docs"
  echo "  build <slice>         Run Runtime Agent on one implementation slice"
  echo "  build-all             Run Runtime Agent on all queued slices"
  echo "  verify                Run Verify Agent on current deliveries"
  echo "  repair <slice>        Run Repair Agent on one blocked slice"
  echo "  status                Show current network state"
  echo "  auto                  Auto-advance to the next meaningful phase"
  echo
}

auto_advance() {
  local phase phase_status
  phase=$(get_phase)
  phase_status=$(get_phase_status "$phase")

  log "Current phase: $phase ($phase_status)"

  case "$phase" in
    scope)
      if [[ "$phase_status" == "done" ]]; then
        run_seams
      else
        fail "Scope not done yet. Run: ./router.sh scope <brief.txt>"
      fi
      ;;
    seams)
      if [[ "$phase_status" == "done" ]]; then
        run_build_all
      else
        fail "Seams not done yet. Run: ./router.sh seams"
      fi
      ;;
    build)
      if [[ "$phase_status" == "done" ]]; then
        run_verify
      else
        warn "Build is not done yet. Resolve blocked slices or re-run build-all."
      fi
      ;;
    verify)
      if [[ "$phase_status" == "done" ]]; then
        ok "Verification complete — ready for apply or ship review"
      else
        warn "Verification failed — use repair or rethink seams"
      fi
      ;;
    repair)
      if [[ "$phase_status" == "done" ]]; then
        run_verify
      else
        warn "Repair phase failed — review the blocked slice"
      fi
      ;;
    *)
      warn "Unknown phase: $phase"
      show_status
      ;;
  esac
}

case "${1:-status}" in
  scope)     run_scope "${2:-}" ;;
  seams)     run_seams ;;
  build)     run_build "${2:-}" ;;
  build-all) run_build_all ;;
  verify)    run_verify ;;
  repair)    run_repair "${2:-}" ;;
  status)    show_status ;;
  auto)      auto_advance ;;
  help|-h)   usage ;;
  *)         usage ;;
esac
