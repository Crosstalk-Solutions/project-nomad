#!/bin/bash
#
# install_nomad_preflight_test.sh
#
# Focused tests for the host preflight in install_nomad.sh: deriving the
# propagation-sensitive mounts and published ports from the management Compose
# file, inspecting them, and failing before any installation resource is
# created. The installer is sourced, and its findmnt/ss wrappers are replaced
# with stubs, so the tests need no root, Docker, or network.
#
# Usage:  bash install/tests/install_nomad_preflight_test.sh
#
# Exit codes:
#   0 - All assertions passed
#   1 - One or more assertions failed (each is printed as "not ok - ...")

# shellcheck disable=SC2016,SC2329
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER="${SCRIPT_DIR}/../install_nomad.sh"
COMPOSE_FILE="${SCRIPT_DIR}/../management_compose.yaml"
failures=0

fail() {
  printf 'not ok - %s\n' "$1"
  failures=$((failures + 1))
}

pass() {
  printf 'ok - %s\n' "$1"
}

assert_success() {
  local description="$1"
  shift
  if ( "$@" ) >/tmp/nomad-preflight-test.out 2>&1; then
    pass "$description"
  else
    fail "$description"
    cat /tmp/nomad-preflight-test.out
  fi
}

assert_failure_with() {
  local description="$1"
  local expected="$2"
  shift 2
  if ( "$@" ) >/tmp/nomad-preflight-test.out 2>&1; then
    fail "$description"
  elif grep -Fq "$expected" /tmp/nomad-preflight-test.out; then
    pass "$description"
  else
    fail "$description"
    cat /tmp/nomad-preflight-test.out
  fi
}

if ! grep -Fq '[[ "${BASH_SOURCE[0]}" == "$0" ]]' "$INSTALLER"; then
  fail "installer can be sourced without running main"
  exit 1
fi

# shellcheck source=install/install_nomad.sh
source "$INSTALLER"

mapfile -t published_ports < <(get_published_management_ports "$COMPOSE_FILE")
if [[ "${published_ports[*]}" == "8080 tcp 9999 tcp" ]]; then
  pass "derives every published management port"
else
  fail "derives every published management port"
fi

edge_compose=$(mktemp)
cat > "$edge_compose" <<'YAML'
services:
  a:
    ports:
      - "6333-6334:6333-6334"
      - "53:53/udp"
      - "127.0.0.1:7000:7000"
      - "3000"
    volumes:
      - named_vol:/data:rshared
      - /srv/data:/host/data:rslave
YAML

mapfile -t edge_ports < <(get_published_management_ports "$edge_compose")
if [[ "${edge_ports[*]}" == "53 udp 6333 tcp 6334 tcp 7000 tcp" ]]; then
  pass "expands port ranges and keeps the published protocol"
else
  fail "expands port ranges and keeps the published protocol"
  printf '  got: %s\n' "${edge_ports[*]}"
fi

mapfile -t edge_mounts < <(get_propagation_mount_paths "$edge_compose")
if [[ "${edge_mounts[*]}" == "/srv/data" ]]; then
  pass "ignores named volumes when deriving propagation mounts"
else
  fail "ignores named volumes when deriving propagation mounts"
  printf '  got: %s\n' "${edge_mounts[*]}"
fi

mapfile -t propagation_mounts < <(get_propagation_mount_paths "$COMPOSE_FILE")
if [[ "${propagation_mounts[*]}" == "/" ]]; then
  pass "derives every propagation-sensitive host mount"
else
  fail "derives every propagation-sensitive host mount"
fi

mount_propagation_for_path() { printf '%s\n' shared; }
is_port_in_use() { return 1; }
assert_success "compatible mounts and free ports pass" run_host_preflight "$COMPOSE_FILE"

mount_propagation_for_path() { printf '%s\n' slave; }
assert_success "slave propagation passes" run_host_preflight "$COMPOSE_FILE"

mount_propagation_for_path() { printf '%s\n' private; }
assert_failure_with "private mount reports remediation" "mount propagation must be shared or slave" run_host_preflight "$COMPOSE_FILE"

mount_propagation_for_path() { return 1; }
assert_failure_with "unavailable propagation detection fails clearly" "Unable to inspect mount propagation" run_host_preflight "$COMPOSE_FILE"

mount_propagation_for_path() { printf '%s\n' shared; }
command() {
  if [[ "$1" == "-v" && "$2" == "ss" ]]; then
    return 1
  fi
  builtin command "$@"
}
assert_failure_with "unavailable port detection fails clearly" "Unable to inspect management ports" run_host_preflight "$COMPOSE_FILE"
unset -f command

is_port_in_use() { [[ "$1" == "9999" ]]; }
assert_failure_with "occupied Dozzle port identifies the port" "Port 9999/tcp is already in use" run_host_preflight "$COMPOSE_FILE"

is_port_in_use() { [[ "$1" == "8080" ]]; }
assert_failure_with "occupied Admin port identifies the port" "Port 8080/tcp is already in use" run_host_preflight "$COMPOSE_FILE"

assert_failure_with "occupied port warns that rerunning resets the database" "Rerunning the installer is not an update path" run_host_preflight "$COMPOSE_FILE"

preflight_line=$(grep -n '^[[:space:]]*run_host_preflight ' "$INSTALLER" | tail -n 1 | cut -d: -f1)
create_line=$(grep -n '^[[:space:]]*create_nomad_directory$' "$INSTALLER" | tail -n 1 | cut -d: -f1)
if [[ -n "$preflight_line" && -n "$create_line" && "$preflight_line" -lt "$create_line" ]]; then
  pass "preflight runs before installation directory creation"
else
  fail "preflight runs before installation directory creation"
fi

if grep -Fq 'download_management_compose_file "$preflight_compose_file"' "$INSTALLER"; then
  pass "installation reuses the preflighted compose file"
else
  fail "installation reuses the preflighted compose file"
fi

side_effect_dir=$(mktemp -d)
rmdir "$side_effect_dir"
(
  NOMAD_DIR="$side_effect_dir"
  check_is_debian_based() { :; }
  check_is_x86_64() { :; }
  check_is_bash() { :; }
  check_has_sudo() { :; }
  ensure_dependencies_installed() { :; }
  check_is_debug_mode() { :; }
  banner() { :; }
  get_install_confirmation() { :; }
  accept_terms() { :; }
  ensure_docker_installed() { :; }
  check_docker_compose() { :; }
  setup_nvidia_container_toolkit() { :; }
  get_local_ip() { :; }
  curl() { cp "$COMPOSE_FILE" "${@: -1}"; }
  mount_propagation_for_path() { printf '%s\n' private; }
  is_port_in_use() { return 1; }
  main
) >/tmp/nomad-preflight-main-test.out 2>&1
main_status=$?
if [[ "$main_status" -ne 0 ]] &&
   [[ ! -e "$side_effect_dir" ]] &&
   grep -Fq "Project NOMAD host preflight failed" /tmp/nomad-preflight-main-test.out; then
  pass "main fails preflight before creating the installation directory"
else
  fail "main fails preflight before creating the installation directory"
  cat /tmp/nomad-preflight-main-test.out
fi

rm -f /tmp/nomad-preflight-test.out /tmp/nomad-preflight-main-test.out "$edge_compose"

if (( failures > 0 )); then
  printf '\n%d test(s) failed\n' "$failures"
  exit 1
fi

printf '\nall tests passed\n'