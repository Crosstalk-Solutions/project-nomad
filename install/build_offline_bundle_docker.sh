#!/usr/bin/env bash

# Project NOMAD Offline Artifact Bundle Builder — Docker entry point

###################################################################################################################################################################################################

# Script                | Project NOMAD Offline Bundle Builder (Docker entry point)
# Version               | 1.1.0
# Author                | Crosstalk Solutions, LLC
# Website               | https://crosstalksolutions.com

###################################################################################################################################################################################################
#
# Runs build_offline_bundle.sh inside a container so the build environment is
# identical everywhere and the build machine needs nothing but Docker.
#
#   ./install/build_offline_bundle_docker.sh --target ubuntu:26.04
#
# With no --output the script asks where to put the bundle, offering the current
# location and any connected removable drives. Use --no-prompt for unattended
# builds. All other options are passed straight through to
# build_offline_bundle.sh.
#
# Requirements on the build machine: Docker (running, with internet access).
# No git, bash 4, coreutils or other host tooling is needed — the container
# supplies all of it.
#
###################################################################################################################################################################################################

set -Eeuo pipefail

RESET='\033[0m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
GREEN='\033[1;32m'

# Alpine image carrying the Docker CLI and Compose v2. Override for a mirror.
BUILDER_IMAGE="${NOMAD_BUILDER_IMAGE:-docker:cli}"
DOCKER_SOCKET="${NOMAD_DOCKER_SOCKET:-/var/run/docker.sock}"
NO_PROMPT="${NOMAD_NO_PROMPT:-0}"

# A finished bundle is roughly 1 GB; the build needs headroom on top of that.
REQUIRED_SPACE_KB=3145728

log() { echo -e "${YELLOW}#${RESET} $*"; }
die() {
  echo -e "${RED}#${RESET} $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Project NOMAD Offline Bundle Builder — Docker entry point

Usage:
  ./install/build_offline_bundle_docker.sh [options]

Runs the bundle build inside a container. Docker is the only requirement on
this machine.

Options handled here:
  --output DIR     Where to write the bundle. If omitted you are asked, with
                   the current location and any connected removable drives
                   offered as choices.
  --no-prompt      Never ask; use the default location. Implied when this is
                   not an interactive terminal (CI, pipes).
  -h, --help       Show this help text and exit.

Environment:
  NOMAD_NO_PROMPT=1        Same as --no-prompt
  NOMAD_BUILDER_IMAGE      Build container image (default: docker:cli)
  NOMAD_DOCKER_SOCKET      Docker socket (default: /var/run/docker.sock)

Every other option is passed through to install/build_offline_bundle.sh:

  --target OS:VERSION          Target operating system (default: ubuntu:26.04)
  --arch ARCH                  Target architecture (default: amd64)
  --repo PATH                  Project NOMAD source checkout
  --without-nvidia-toolkit     Omit the NVIDIA Container Toolkit packages
  --extra-image-list FILE      Also pull and bundle these image references
  --extra-image-archive FILE   Include an existing docker-save archive
  --content-dir DIR            Include pre-staged NOMAD storage content
  --archive                    Also produce a .tar.gz of the bundle
EOF
}

check_docker_available() {
  command -v docker > /dev/null 2>&1 ||
    die "docker was not found. Docker is the only requirement for building a bundle."

  docker info > /dev/null 2>&1 ||
    die "The Docker daemon is not reachable. Start Docker and try again."

  [[ -S "${DOCKER_SOCKET}" ]] ||
    die "No Docker socket at ${DOCKER_SOCKET}. Set NOMAD_DOCKER_SOCKET if yours lives elsewhere."
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                    Output Location                                                                                              #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

# Free space on the nearest existing ancestor of a not-yet-created directory.
space_of() {
  local path="$1" unit="$2"
  while [[ ! -d "${path}" && "${path}" != '/' ]]; do
    path="$(dirname -- "${path}")"
  done
  if [[ "${unit}" == 'kb' ]]; then
    df -Pk "${path}" 2>/dev/null | awk 'NR == 2 { print $4 }'
  else
    df -h "${path}" 2>/dev/null | awk 'NR == 2 { print $4 }'
  fi
}

is_mount_point() {
  local path="$1" parent
  parent="$(dirname -- "${path}")"
  [[ "$(df -P "${path}" 2>/dev/null | awk 'NR == 2 { print $1 }')" \
     != "$(df -P "${parent}" 2>/dev/null | awk 'NR == 2 { print $1 }')" ]]
}

# Removable/external volumes, so a bundle can be written straight to the USB
# drive it will be carried on. Platform-specific because there is no portable
# way to enumerate mounted media.
detect_removable_mounts() {
  local volume base
  case "$(uname -s)" in
    Darwin)
      for volume in /Volumes/*; do
        # The boot volume appears here as a symlink to /.
        [[ -d "${volume}" && ! -L "${volume}" && -w "${volume}" ]] || continue
        echo "${volume}"
      done
      ;;
    Linux)
      for base in "/media/$(id -un)" /media "/run/media/$(id -un)" /mnt; do
        [[ -d "${base}" ]] || continue
        for volume in "${base}"/*; do
          [[ -d "${volume}" && -w "${volume}" ]] || continue
          is_mount_point "${volume}" || continue
          echo "${volume}"
        done
      done
      ;;
  esac
}

# Which volume, if any, the checkout itself lives on — used to point out that a
# choice keeps everything together on one drive.
containing_volume() {
  local path="$1" volume
  while IFS= read -r volume; do
    [[ -n "${volume}" ]] || continue
    if [[ "${path}" == "${volume}" || "${path}" == "${volume}"/* ]]; then
      echo "${volume}"
      return 0
    fi
  done < <(detect_removable_mounts)
  return 1
}

# Populates OUTPUT_CANDIDATES / OUTPUT_LABELS: where the build is running from
# first, then any connected removable drives, then the home directory.
build_output_candidates() {
  local default_dir="${PWD}/dist"
  local repo_volume='' volume label

  OUTPUT_CANDIDATES=("${default_dir}")
  OUTPUT_LABELS=('here (current directory)')

  repo_volume="$(containing_volume "${REPO_ROOT}" || true)"

  while IFS= read -r volume; do
    [[ -n "${volume}" ]] || continue
    # Already covered by the "here" option.
    [[ "${volume}/nomad-bundles" != "${default_dir}" ]] || continue
    label="removable drive: $(basename -- "${volume}")"
    [[ "${volume}" != "${repo_volume}" ]] || label="${label} — same drive as this checkout"
    OUTPUT_CANDIDATES+=("${volume}/nomad-bundles")
    OUTPUT_LABELS+=("${label}")
  done < <(detect_removable_mounts | sort -u)

  OUTPUT_CANDIDATES+=("${HOME}/nomad-bundles")
  OUTPUT_LABELS+=('home directory')
}

# Renders the menu and reads a choice. Assumes stdin is worth reading; the
# interactivity decision belongs to choose_output_dir.
prompt_for_output_dir() {
  build_output_candidates

  echo ''
  echo -e "${GREEN}#${RESET} Where should the bundle be written? (about 1 GB)"
  echo ''
  local index=1 free
  while [[ "${index}" -le "${#OUTPUT_CANDIDATES[@]}" ]]; do
    free="$(space_of "${OUTPUT_CANDIDATES[$((index - 1))]}" 'human')"
    printf '  %d) %s\n' "${index}" "${OUTPUT_CANDIDATES[$((index - 1))]}"
    printf '     %s%s\n' "${OUTPUT_LABELS[$((index - 1))]}" "${free:+ — ${free} free}"
    [[ "${index}" -ne 1 ]] || printf '     [default]\n'
    index=$((index + 1))
  done
  echo '  c) enter a custom path'
  echo ''

  local reply chosen=''
  while [[ -z "${chosen}" ]]; do
    read -r -p "Choice [1]: " reply || reply=''
    reply="${reply:-1}"
    case "${reply}" in
      c|C)
        read -r -p 'Path: ' reply || reply=''
        [[ -n "${reply}" ]] || continue
        chosen="${reply}"
        ;;
      *[!0-9]*)
        echo 'Please enter one of the numbers above, or c for a custom path.'
        ;;
      *)
        if [[ "${reply}" -ge 1 && "${reply}" -le "${#OUTPUT_CANDIDATES[@]}" ]]; then
          chosen="${OUTPUT_CANDIDATES[$((reply - 1))]}"
        else
          echo 'Please enter one of the numbers above, or c for a custom path.'
        fi
        ;;
    esac
  done

  OUTPUT_CHOICE="${chosen}"
}

choose_output_dir() {
  # Non-interactive: never block a script or CI run waiting on stdin.
  if [[ "${NO_PROMPT}" == '1' || ! -t 0 ]]; then
    OUTPUT_CHOICE="${PWD}/dist"
    log "Writing the bundle to ${OUTPUT_CHOICE} (use --output to change it)."
    return 0
  fi

  prompt_for_output_dir
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                        Main Script                                                                                              #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

# The test suite sources this script to exercise individual functions. Every
# other invocation runs the build normally.
if [[ "${NOMAD_BUILDER_LIB_ONLY:-}" == '1' ]]; then
  return 0 2>/dev/null || exit 0
fi

# --help must work without a running daemon, so handle it before any checks.
for arg in "$@"; do
  case "${arg}" in
    -h|--help)
      usage
      exit 0
      ;;
  esac
done

check_docker_available

[[ -f "${REPO_ROOT}/install/build_offline_bundle.sh" ]] ||
  die "Could not find install/build_offline_bundle.sh next to this script."

# The build starts further containers whose bind mounts are resolved by the host
# Docker daemon, so every path the build touches has to exist at the SAME
# absolute location inside the container as on the host. Resolve each
# path-valued option to an absolute host path and mount it there.
mount_paths=("${REPO_ROOT}")
passthrough_args=()
output_dir=''

require_value() { [[ $2 -ge 2 ]] || die "$1 requires a value."; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      require_value "$1" $#
      mkdir -p "$2" || die "Could not create output directory: $2"
      output_dir="$(cd -- "$2" && pwd)"
      shift 2
      ;;
    --no-prompt)
      NO_PROMPT='1'
      shift
      ;;
    --repo|--content-dir)
      require_value "$1" $#
      [[ -d "$2" ]] || die "$1: directory not found: $2"
      resolved="$(cd -- "$2" && pwd)"
      mount_paths+=("${resolved}")
      passthrough_args+=("$1" "${resolved}")
      shift 2
      ;;
    --extra-image-archive|--extra-image-list)
      require_value "$1" $#
      [[ -f "$2" ]] || die "$1: file not found: $2"
      resolved_dir="$(cd -- "$(dirname -- "$2")" && pwd)"
      mount_paths+=("${resolved_dir}")
      passthrough_args+=("$1" "${resolved_dir}/$(basename -- "$2")")
      shift 2
      ;;
    *)
      passthrough_args+=("$1")
      shift
      ;;
  esac
done

if [[ -z "${output_dir}" ]]; then
  OUTPUT_CHOICE=''
  choose_output_dir
  mkdir -p "${OUTPUT_CHOICE}" || die "Could not create output directory: ${OUTPUT_CHOICE}"
  output_dir="$(cd -- "${OUTPUT_CHOICE}" && pwd)"
fi

mount_paths+=("${output_dir}")
passthrough_args+=(--output "${output_dir}")

available_kb="$(space_of "${output_dir}" 'kb')"
if [[ -n "${available_kb}" && "${available_kb}" -lt "${REQUIRED_SPACE_KB}" ]]; then
  log "Warning: only $(space_of "${output_dir}" 'human') free at ${output_dir}; a bundle needs roughly 1 GB plus working room."
fi

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                        Run the Build                                                                                            #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

# Sort shortest-first so an ancestor is always seen before anything nested
# inside it, then skip paths an existing mount already covers.
mount_args=()
mounted=()
while IFS= read -r path; do
  [[ -n "${path}" ]] || continue
  covered='false'
  for existing in ${mounted[@]+"${mounted[@]}"}; do
    if [[ "${path}" == "${existing}" || "${path}" == "${existing}"/* ]]; then
      covered='true'
      break
    fi
  done
  [[ "${covered}" == 'false' ]] || continue
  mounted+=("${path}")
  mount_args+=(-v "${path}:${path}")
done < <(printf '%s\n' "${mount_paths[@]}" | awk '{ print length, $0 }' | sort -n | cut -d' ' -f2-)

log "Building in ${BUILDER_IMAGE} (host needs only Docker)..."
log "Bundle will be written to ${output_dir}"

# git safe.directory is set because the checkout is owned by the host user, not
# by root inside the container.
docker run --rm \
  -v "${DOCKER_SOCKET}:/var/run/docker.sock" \
  "${mount_args[@]}" \
  -w "${REPO_ROOT}" \
  "${BUILDER_IMAGE}" \
  sh -c '
    set -e
    apk add --no-cache bash git coreutils findutils tar gzip > /dev/null
    git config --global --add safe.directory "*"
    exec bash install/build_offline_bundle.sh "$@"
  ' sh "${passthrough_args[@]}"

echo ''
echo -e "${GREEN}#${RESET} Done. The bundle is in ${output_dir}"
