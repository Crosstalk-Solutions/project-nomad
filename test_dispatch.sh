#!/usr/bin/env bash
# test_dispatch.sh — scenario harness for issue #7 (per-family Docker install).
#
# Extracts the REAL install_docker_native + ensure_docker_installed verbatim
# from install/install_nomad.sh and drives them in a hermetic sandbox:
#   - PATH is ONLY $BIN: logging stubs + symlinked coreutils, so the host's
#     real docker/systemctl/pacman/curl (usr-merged into /usr/bin) never leak.
#   - A `sed` shim makes the two hard-coded /etc/os-release reads return a
#     per-scenario FAKE_ID, so almalinux / ol / fedora / ubuntu can be
#     simulated on this Arch host.
#   - The `sudo` stub models "the installer worked": on seeing pacman/dnf/
#     get-docker.sh it drops a fake working `docker` into $BIN.
#   - Each scenario runs in a subshell, so the functions' own `exit 1`
#     stops the scenario, not the whole harness; results are read back from
#     $TMP/s.out (stdout/stderr) and $TMP/s.log (stub call log).
#
# Assertions are on *which* installer path ran (call log + messages), which
# is exactly what issue #7's acceptance criteria specify.
#
set -u
REPO="$HOME/Projects/nomad-unchained"
SCRIPT="$REPO/install/install_nomad.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
BIN="$TMP/bin"; mkdir -p "$BIN"

# --- stubs --------------------------------------------------------------
make_sed() {
  cat > "$BIN/sed" <<'EOF'
#!/bin/sh
for a in "$@"; do
  if [[ "$a" == /etc/os-release ]]; then
    if [[ -n "${FAKE_ID:-}" ]]; then printf '%s\n' "${FAKE_ID}"; fi
    exit 0
  fi
done
exec /usr/sbin/sed "$@"
EOF
  chmod +x "$BIN/sed"
}
make_sudo() {  # logs; models a successful install placing a working docker
  cat > "$BIN/sudo" <<EOF
#!/bin/sh
echo "sudo: \$*" >> "$TMP/s.log"
case "\$*" in
  *systemctl*start*|*systemctl*enable*)
    touch "$TMP/act.state"
    ;;
esac
case "\$*" in
  *pacman*|*dnf*|*get-docker.sh*)
    {
      echo '#!/bin/sh'
      echo 'case "\${1:-}" in'
      echo '  --version) echo "Docker version 27.1.1, build 6382278" ;;'
      echo '  version)   echo "Client: Docker Engine - Community"; echo "Server: Docker Engine - Community" ;;'
      echo '  compose)   echo "Docker Compose version v2.29.1" ;;'
      echo 'esac'
      echo 'exit 0'
    } > "$BIN/docker"
    chmod +x "$BIN/docker"
    touch "$TMP/act.state"
    ;;
esac
exit 0
EOF
  chmod +x "$BIN/sudo"
}
make_docker() {  # fake docker; podman or real engine per FAKE_DOCKER
  cat > "$BIN/docker" <<'EOF'
#!/bin/sh
if [[ "${FAKE_DOCKER:-real}" == podman ]]; then
  case "${1:-}" in
    --version) echo "podman version 4.9.2-r2" ;;
    version)   echo "Client: podman 4.9.2" ;;
  esac
  exit 0
fi
case "${1:-}" in
  --version) echo "Docker version 27.1.1, build 6382278" ;;
  version)   echo "Client: Docker Engine - Community"; echo "Server: Docker Engine - Community" ;;
  compose)   echo "Docker Compose version v2.29.1" ;;
esac
exit 0
EOF
  chmod +x "$BIN/docker"
}
make_systemctl() {  # stateful: is-active fails until a start is seen
  cat > "$BIN/systemctl" <<EOF
#!/bin/sh
case "\${1:-}" in
  is-active) [[ -e "$TMP/act.state" ]] && exit 0 || exit 1;;
  start)     touch "$TMP/act.state"; exit 0;;
  *)         exit 0;;
esac
EOF
  chmod +x "$BIN/systemctl"
}
make_dnf() {
  cat > "$BIN/dnf" <<EOF
#!/bin/sh
echo "dnf: \$*" >> "$TMP/s.log"
exit 0
EOF
  chmod +x "$BIN/dnf"
}
make_curl() {
  cat > "$BIN/curl" <<EOF
#!/bin/sh
echo "curl: \$*" >> "$TMP/s.log"
exit 0
EOF
  chmod +x "$BIN/curl"
}
for u in sh bash grep head tr cat awk cut env uname date hostname tar chmod rm ln printf test true false touch mkdir; do
  rm -f "$BIN/$u"
  ln -s "$(command -v "$u")" "$BIN/$u"
done

# --- globals the extracted functions rely on ----------------------------
YELLOW=''; RESET=''; RED=''; GREEN=''
PKG_FAMILY=""
pkg_install() { echo "pkg_install: $*" >> "$TMP/s.log"; }

# --- extract the two functions verbatim ---------------------------------
BEGIN=$(grep -n '^install_docker_native() {' "$SCRIPT" | cut -d: -f1)
END=$(awk -v b="$BEGIN" 'NR>=b && /^}/{print NR; exit}' "$SCRIPT")
FSTART=$(grep -n '^ensure_docker_installed() {' "$SCRIPT" | cut -d: -f1)
FEND=$(awk -v s="$FSTART" 'NR>s && /^}/{print NR; exit}' "$SCRIPT")
{ sed -n "${BEGIN},${END}p" "$SCRIPT"; echo; sed -n "${FSTART},${FEND}p" "$SCRIPT"; } > "$TMP/fns.sh"
. "$TMP/fns.sh"

PATH="$BIN"
PASS=0; FAIL=0

# --- scenario runner -----------------------------------------------------
reset_run() {
  rm -f "$TMP/s.log" "$TMP/s.out" "$TMP/act.state" "$BIN/docker" "$BIN/systemctl" "$BIN/dnf" "$BIN/curl"
}
# run <family> <osid> <docker:absent|real|podman> <preactive:yes|no> [dnf] [curl]
run() {
  PKG_FAMILY="$1"; FAKE_ID="$2"; FAKE_DOCKER="$3"
  local preactive="$4" with_dnf="${5:-no}" with_curl="${6:-no}"
  reset_run
  [[ "$preactive" == yes ]] && touch "$TMP/act.state"
  make_sed
  make_sudo
  make_systemctl
  [[ "$with_dnf"  == yes ]] && make_dnf
  [[ "$with_curl" == yes ]] && make_curl
  case "$3" in real|podman) make_docker ;; esac
  (
    export PATH BIN TMP FAKE_ID FAKE_DOCKER PKG_FAMILY
    . "$TMP/fns.sh"
    pkg_install() { echo "pkg_install: $*" >> "$TMP/s.log"; }
    ensure_docker_installed || return 1
  ) > "$TMP/s.out" 2>&1
  echo "RC=$?" >> "$TMP/s.out"
}
check() {  # check <name> <expr-evaluated-against-s.out/s.log>
  local name="$1" ok=0
  local out log
  out="$(cat "$TMP/s.out" 2>/dev/null)"
  log="$(cat "$TMP/s.log" 2>/dev/null)"
  if eval "$2"; then ok=1; fi
  if [[ $ok -eq 1 ]]; then PASS=$((PASS+1)); echo "PASS  $name"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $name"
    echo "      calllog: ${log:-<empty>}"
    echo "      stdout : $(printf '%s' "$out" | tr '\n' '|' | head -c 300)"
  fi
}

# A: Arch, docker absent -> pacman native; NOT get.docker.com, NOT get-docker.sh
PKG_FAMILY=arch; run arch manjaro absent no no yes
check "A  arch -> pacman native, no get.docker.com" '[[ "$log" == *pacman* && "$log" != *"get-docker.sh"* && "$log" != *"dnf config-manager"* && "$out" == *"installation completed"* ]]'

# B: AlmaLinux 9, docker absent -> dnf native
run rhel almalinux absent no yes yes
check "B  almalinux -> dnf native, no get.docker.com" '[[ "$log" == *"dnf config-manager --add-repo"* && "$log" != *"get-docker.sh"* && "$log" != *pacman* && "$out" == *"installation completed"* ]]'

# C: Oracle Linux, docker absent -> dnf native
run rhel ol absent no yes no
check "C  oracle -> dnf native" '[[ "$log" == *"dnf config-manager --add-repo"* && "$out" == *"installation completed"* ]]'

# I: Rocky Linux, docker absent -> dnf native (AC-1 newly routes rocky to dnf)
run rhel rocky absent no yes no
check "I  rocky -> dnf native (newly routed), no get.docker.com" '[[ "$log" == *"dnf config-manager --add-repo"* && "$log" != *"get-docker.sh"* && "$log" != *pacman* && "$out" == *"installation completed"* ]]'

# J: RHEL, docker absent -> dnf native (AC-1 routes rhel to dnf)
run rhel rhel absent no yes no
check "J  rhel -> dnf native (AC-1), no get.docker.com" '[[ "$log" == *"dnf config-manager --add-repo"* && "$log" != *"get-docker.sh"* && "$out" == *"installation completed"* ]]'

# D: Fedora, docker absent -> get.docker.com (default preserved)
run rhel fedora absent no yes no
check "D  fedora -> get.docker.com path" '[[ "$log" == *"get-docker.sh"* && "$log" != *pacman* && "$log" != *"dnf config-manager"* && "$out" == *"installation completed"* ]]'

# E: Ubuntu, docker absent -> get.docker.com (default preserved)
run debian ubuntu absent no no yes
check "E  ubuntu -> get.docker.com path" '[[ "$log" == *"get-docker.sh"* && "$log" != *pacman* && "$out" == *"installation completed"* ]]'

# F: podman shim on PATH -> warn + fail, no install attempted
run debian ubuntu podman no no no
check "F  podman shim -> clear warning, no install, nonzero exit" '[[ "$log" != *pkg_install* && "$out" == *podman* && "$out" == *"Docker Engine"* && "$out" != *"Docker not found"* && "$out" == *"RC=1"* ]]'

# G: docker present+active -> fast path, no reinstall
run debian ubuntu real yes no no
check "G  docker present+active -> fast path, no install" '[[ "$out" == *"already installed"* && "$out" == *"already running"* && "$log" != *"get-docker.sh"* && "$log" != *pacman* ]]'

# H: docker present but inactive -> start it
run debian ubuntu real no no no
check "H  docker present+inactive -> start attempted, success" '[[ "$out" == *"not running"* && "$out" == *"started successfully"* ]]'

echo
echo "===== $PASS passed, $FAIL failed ====="
[[ $FAIL -eq 0 ]]
