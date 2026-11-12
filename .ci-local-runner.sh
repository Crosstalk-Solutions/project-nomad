#!/bin/bash
# Local faithful reproduction of the CI `matrix` job in
# .github/workflows/install-scripts.yml (current form: full in-container
# install -> update -> uninstall lifecycle). Mirrors the workflow steps exactly:
#   1. bind-mount install/ read-only at /work
#   2. write the same lifecycle.sh harness the workflow writes to $RUNNER_TEMP
#   3. docker run --user 0:0 -e NOMAD_CI_MODE=1 -e NOMAD_ASSUME_YES=1 -e TERM=dumb
# Usage: .ci-local-runner.sh <image> [<image> ...]
set -uo pipefail
imgs=("$@")
[ "${#imgs[@]}" -eq 0 ] && { echo "usage: $0 <image> [<image> ...]"; exit 2; }
ws="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
overall=0
for img in "${imgs[@]}"; do
  echo "=============================================================="
  echo "=== LOCAL MATRIX RUN (lifecycle): $img ==="
  echo "=============================================================="
  RUNNER_TEMP="$(mktemp -d)"
  cat > "$RUNNER_TEMP/lifecycle.sh" <<'LIFE'
#!/bin/sh
set -eu
# 0. sudo shim: minimal base images ship no sudo, and `sudo -n true` fails
#    even as root on the debian/ubuntu minimal images. When uid 0, sudo is a
#    passthrough no-op wrapper, so a small shim that drops no-op sudo flags
#    (-n/-S/-H/-u/-g) and execs the command that remains satisfies
#    check_has_sudo and every `sudo <pkg-mgr>` call.
if ! command -v sudo >/dev/null 2>&1; then
  cat > /usr/local/bin/sudo <<'SHIM'
#!/bin/sh
# passthrough sudo shim (CI only): we are root, so sudo is a no-op.
for a in "$@"; do
  case "$a" in
    -n|-S|-H) ;;
    -u|-g) shift; shift ;;
    *) break ;;
  esac
  shift
done
if [ -n "$1" ]; then
  exec "$@"
fi
SHIM
  chmod +x /usr/local/bin/sudo
fi
command -v sudo >/dev/null 2>&1 || { echo "sudo missing after shim"; exit 1; }
sudo -n true || { echo "sudo -n true failed after shim"; exit 1; }
echo "PASS sudo at $(command -v sudo)"

# 1. INSTALL
echo "===== STEP 1/3: install ====="
bash /work/install_nomad.sh
test -f /opt/project-nomad/compose.yml || { echo "install did not produce /opt/project-nomad/compose.yml"; exit 1; }
echo "PASS /opt/project-nomad/compose.yml present"

# 2. UPDATE
echo "===== STEP 2/3: update ====="
bash /work/update_nomad.sh
echo "PASS update exited 0"

# 3. UNINSTALL
echo "===== STEP 3/3: uninstall ====="
bash /work/uninstall_nomad.sh
test ! -d /opt/project-nomad || { echo "uninstall did not remove /opt/project-nomad"; exit 1; }
echo "PASS /opt/project-nomad removed"

echo "### LIFECYCLE_OK"
LIFE
chmod +x "$RUNNER_TEMP/lifecycle.sh"
  docker run --rm \
    -v "$ws/install:/work:ro" \
    -v "$RUNNER_TEMP/lifecycle.sh:/lifecycle.sh" \
    -e NOMAD_CI_MODE=1 \
    -e NOMAD_ASSUME_YES=1 \
    -e TERM=dumb \
    -w /work \
    --user 0:0 \
    "$img" \
    sh -c 'exec bash /lifecycle.sh'
  rc=$?
  rm -rf "$RUNNER_TEMP"
  echo "=== $img exit=$rc ==="
  [ "$rc" -ne 0 ] && overall=1
done
exit "$overall"
