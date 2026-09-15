#!/bin/bash

# Project NOMAD Installed Image Capture Helper

###################################################################################################################################################################################################
#
# Exports the Docker images present on an already-populated Project NOMAD host so
# they can be added to an offline artifact bundle with:
#
#   ./build_offline_bundle.sh --extra-image-archive <archive>
#
# This transports images only. It does NOT prove that the corresponding Supply
# Depot apps install offline — their install logic and catalog metadata may have
# their own network dependencies. See admin/docs/offline-install.md.
#
###################################################################################################################################################################################################

set -Eeuo pipefail

RESET='\033[0m'
RED='\033[1;31m'
GREEN='\033[1;32m'

OUTPUT_DIR="${PWD}/nomad-image-export"
INCLUDE_ALL='0'

die() {
  echo -e "${RED}#${RESET} $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  ./capture_installed_images.sh [--output DIR] [--all-local-images]

Discovers, by default:
  * images referenced by /opt/project-nomad/compose.yml
  * images used by containers whose names start with "nomad_"

Options:
  --output DIR          Where to write the archive (default: ./nomad-image-export)
  --all-local-images    Also export every tagged image present on this host
  -h, --help            Show this help text and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      [[ $# -ge 2 ]] || die "--output requires a directory."
      OUTPUT_DIR="$2"
      shift
      ;;
    --all-local-images)
      INCLUDE_ALL='1'
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "Unknown option: $1"
      ;;
  esac
  shift
done

command -v docker > /dev/null 2>&1 || die "docker is required."
mkdir -p "${OUTPUT_DIR}"

declare -A seen=()
images=()

add_image() {
  local image="$1"
  [[ -n "${image}" && "${image}" != '<none>:<none>' ]] || return 0
  if [[ -z "${seen[${image}]+set}" ]]; then
    seen["${image}"]='1'
    images+=("${image}")
  fi
}

if [[ -f /opt/project-nomad/compose.yml ]]; then
  while IFS= read -r image; do
    add_image "${image}"
  done < <(docker compose -f /opt/project-nomad/compose.yml config --images 2>/dev/null || true)
fi

while IFS= read -r image; do
  add_image "${image}"
done < <(docker ps -a --filter 'name=^nomad_' --format '{{.Image}}')

if [[ "${INCLUDE_ALL}" == '1' ]]; then
  while IFS= read -r image; do
    add_image "${image}"
  done < <(docker image ls --format '{{.Repository}}:{{.Tag}}')
fi

[[ ${#images[@]} -gt 0 ]] || die "No images were discovered on this host."

missing='0'
for image in "${images[@]}"; do
  if ! docker image inspect "${image}" > /dev/null 2>&1; then
    echo "Image referenced but not present locally: ${image}" >&2
    missing='1'
  fi
done
[[ "${missing}" == '0' ]] || die "Every discovered image must exist locally before export."

printf '%s\n' "${images[@]}" | sort -u > "${OUTPUT_DIR}/optional-images.txt"

docker save -o "${OUTPUT_DIR}/optional-images.tar" "${images[@]}" || die "docker save failed."

(cd "${OUTPUT_DIR}" && sha256sum optional-images.txt optional-images.tar > SHA256SUMS)

echo ''
echo -e "${GREEN}#${RESET} Exported ${#images[@]} image(s) to ${OUTPUT_DIR}/optional-images.tar"
echo ''
echo "Add to a bundle with:"
printf '  ./build_offline_bundle.sh --extra-image-archive %q\n' "${OUTPUT_DIR}/optional-images.tar"
