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

case "$(uname -s 2>/dev/null || echo unknown)" in
  MINGW*|MSYS*|CYGWIN*) HOST_IS_WINDOWS='1' ;;
  *)                    HOST_IS_WINDOWS='0' ;;
esac
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

  # Docker Desktop on Windows has no Unix socket to stat — it is reached over a
  # named pipe, and the daemon resolves the literal string /var/run/docker.sock
  # against its own Linux VM, where the socket does exist. So the filesystem test
  # only means something where a socket file is what gets mounted.
  if [[ "${HOST_IS_WINDOWS}" != '1' ]]; then
    [[ -S "${DOCKER_SOCKET}" ]] ||
      die "No Docker socket at ${DOCKER_SOCKET}. Set NOMAD_DOCKER_SOCKET if yours lives elsewhere."
  fi
}

# Whether the daemon can actually see a host directory through a bind mount.
#
# Not a formality. Docker Desktop silently yields an EMPTY directory for a path
# it does not share — removable and exFAT volumes among them — so a build whose
# source or output lives there produces a hollow bundle that still passes its own
# verification, because every check reads the same phantom directory. Detect it
# up front by planting a marker and looking for it from inside a container.
docker_can_mount() {
  local dir="$1" marker=".nomad-mount-probe.$$" found=''

  : > "${dir}/${marker}" 2>/dev/null || return 1
  found="$(MSYS_NO_PATHCONV=1 docker run --rm \
    -v "$(host_mount_source "${dir}"):/probe:ro" \
    "${BUILDER_IMAGE}" \
    sh -c "[ -f '/probe/${marker}' ] && echo yes" 2>/dev/null || true)"
  rm -f "${dir}/${marker}"

  [[ "${found}" == 'yes' ]]
}

# The string the DAEMON needs in order to resolve a host directory. Under MSYS,
# a POSIX path like /d/foo means nothing to Docker Desktop, so hand it the
# Windows form; everywhere else the path is already what the daemon expects.
host_mount_source() {
  local dir="$1"
  if [[ "${HOST_IS_WINDOWS}" == '1' ]]; then
    cygpath -m "${dir}" 2>/dev/null || echo "${dir}"
  else
    echo "${dir}"
  fi
}

# Where a host directory must live INSIDE the build container.
#
# The build starts further containers, and their bind mounts are resolved by the
# host daemon — so a path has to mean the same thing in both places. On Linux
# that is free: mount the host path at itself. On Windows it is not, because the
# daemon speaks Windows paths and a Linux container cannot have a directory
# called C:/Users. Docker Desktop bridges this by exposing host drives inside its
# VM at /run/desktop/mnt/host/<drive>, and the daemon resolves that form too — so
# mounting there makes the path identical from both sides.
#
# Without this the resolver container writes its .debs into a phantom directory
# and the build fails with "no package index was produced", or worse, quietly
# produces a bundle with nothing in it.
daemon_identity_path() {
  local dir="$1" win drive rest
  if [[ "${HOST_IS_WINDOWS}" != '1' ]]; then
    echo "${dir}"
    return
  fi

  win="$(cygpath -m "${dir}" 2>/dev/null)" || { echo "${dir}"; return; }
  drive="$(printf '%s' "${win:0:1}" | tr '[:upper:]' '[:lower:]')"
  rest="${win:2}"
  echo "/run/desktop/mnt/host/${drive}${rest}"
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

# A destination the daemon cannot mount is still a perfectly good place to PUT a
# finished bundle — the host can write there even when Docker cannot read there.
# Removable and exFAT volumes are the common case, and carrying the bundle away
# on one is the entire point of this tool. So build somewhere mountable and copy
# the result to where it was asked for, rather than refusing.
STAGING_ROOT=''
staged_output=''

cleanup_staging() {
  [[ -n "${STAGING_ROOT}" && -d "${STAGING_ROOT}" ]] && rm -rf "${STAGING_ROOT}"
}
trap cleanup_staging EXIT

ensure_staging_root() {
  [[ -z "${STAGING_ROOT}" ]] || return 0

  STAGING_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/nomad-bundle-staging.XXXXXX")" ||
    die "Could not create a staging directory."

  docker_can_mount "${STAGING_ROOT}" || die "\
Docker cannot bind-mount the staging directory ${STAGING_ROOT} either.

   Docker Desktop shares only fixed drives by default. Set TMPDIR to a directory
   on a shared drive, or add this drive under Docker Desktop → Settings →
   Resources → File sharing."
}

# The daemon cannot read a checkout on an unshared volume — the build container
# would see an empty directory and produce a hollow bundle that still passes its
# own verification, because every check reads the same phantom path. Copy the
# source somewhere mountable and build from the copy. The working tree is copied
# as-is, uncommitted changes and .git included, so the bundle records the right
# commit and carries exactly what is checked out.
if ! docker_can_mount "${REPO_ROOT}"; then
  ensure_staging_root
  log "Docker cannot mount ${REPO_ROOT} (removable or unshared drive)."
  log "Copying the checkout to ${STAGING_ROOT}/src to build from..."

  mkdir -p "${STAGING_ROOT}/src" || die "Could not create the source staging directory."
  tar -cf - -C "${REPO_ROOT}" \
    --exclude='./admin/node_modules' \
    --exclude='./admin/node_modules_stale_delete_me' \
    --exclude='./node_modules' \
    --exclude='./dist' \
    . | tar -xf - -C "${STAGING_ROOT}/src" ||
    die "Could not copy the checkout to ${STAGING_ROOT}/src."

  REPO_ROOT="${STAGING_ROOT}/src"
  mount_paths[0]="${REPO_ROOT}"
  # A --repo the caller passed explicitly pointed at the same unusable volume.
  for i in "${!passthrough_args[@]}"; do
    [[ "${passthrough_args[$i]}" == '--repo' ]] || continue
    passthrough_args[$((i + 1))]="${REPO_ROOT}"
    break
  done
fi

# A destination the daemon cannot mount is still a perfectly good place to PUT a
# finished bundle — the host can write there even when Docker cannot read there.
# Removable volumes are the common case, and carrying the bundle away on one is
# the entire point of this tool. So build somewhere mountable and copy across.
if ! docker_can_mount "${output_dir}"; then
  ensure_staging_root
  log "Docker cannot mount ${output_dir} (removable or unshared drive)."
  log "Building into staging, then copying the finished bundle across."

  staged_output="${STAGING_ROOT}/out"
  mkdir -p "${staged_output}" || die "Could not create the output staging directory."

  # Replace the --output already queued for the inner script.
  for i in "${!passthrough_args[@]}"; do
    [[ "${passthrough_args[$i]}" == '--output' ]] || continue
    passthrough_args[$((i + 1))]="${staged_output}"
    break
  done
  mount_paths[${#mount_paths[@]} - 1]="${staged_output}"
fi

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
  # Source is what the daemon must resolve; target is the path the build (and
  # every container it starts) will use, chosen so the daemon resolves it to the
  # same directory. On Linux both are the host path.
  mount_args+=(-v "$(host_mount_source "${path}"):$(daemon_identity_path "${path}")")
done < <(printf '%s\n' "${mount_paths[@]}" | awk '{ print length, $0 }' | sort -n | cut -d' ' -f2-)

log "Building in ${BUILDER_IMAGE} (host needs only Docker)..."
log "Bundle will be written to ${output_dir}"

# git safe.directory is set because the checkout is owned by the host user, not
# by root inside the container.
# MSYS_NO_PATHCONV stops Git Bash rewriting the Unix-looking paths in -v and -w
# into Windows ones. The mount SOURCES are converted deliberately above; the
# targets, the socket path and the working directory must survive verbatim.
# Every path the inner script receives has to be the in-container form, since
# it both reads them directly and hands them to nested containers.
for i in "${!passthrough_args[@]}"; do
  case "${passthrough_args[$i]}" in
    --output|--repo|--content-dir|--extra-image-list|--extra-image-archive)
      passthrough_args[$((i + 1))]="$(daemon_identity_path "${passthrough_args[$((i + 1))]}")"
      ;;
  esac
done

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "${DOCKER_SOCKET}:/var/run/docker.sock" \
  "${mount_args[@]}" \
  -w "$(daemon_identity_path "${REPO_ROOT}")" \
  "${BUILDER_IMAGE}" \
  sh -c '
    set -e
    apk add --no-cache bash git coreutils findutils tar gzip > /dev/null
    git config --global --add safe.directory "*"
    exec bash install/build_offline_bundle.sh "$@"
  ' sh "${passthrough_args[@]}"

if [[ -n "${staged_output}" ]]; then
  log "Copying the finished bundle to ${output_dir}..."
  cp -R "${staged_output}"/. "${output_dir}/" ||
    die "The bundle built successfully but could not be copied to ${output_dir}."
fi

echo ''
echo -e "${GREEN}#${RESET} Done. The bundle is in ${output_dir}"
