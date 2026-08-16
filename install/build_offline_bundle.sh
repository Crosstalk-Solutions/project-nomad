#!/bin/bash

# Project NOMAD Offline Artifact Bundle Builder

###################################################################################################################################################################################################

# Script                | Project NOMAD Offline Artifact Bundle Builder
# Version               | 1.0.0
# Author                | Crosstalk Solutions, LLC
# Website               | https://crosstalksolutions.com

###################################################################################################################################################################################################
#
# Builds an offline artifact bundle from a Project NOMAD source checkout.
#
# This script runs on a CONNECTED build machine. The bundle it produces lets
# install_nomad.sh --artifacts install Project NOMAD on a disconnected target of
# the same OS, version and architecture. See admin/docs/offline-install.md.
#
###################################################################################################################################################################################################

set -Eeuo pipefail

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Color Codes                                                                                           #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

RESET='\033[0m'
YELLOW='\033[1;33m'
RED='\033[1;31m' # Light Red.
GREEN='\033[1;32m' # Light Green.

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                  Constants & Variables                                                                                          #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

# Bumped only when the on-disk bundle layout changes in a way install_nomad.sh
# must be able to reject. Keep in sync with SUPPORTED_BUNDLE_FORMAT_VERSION.
BUNDLE_FORMAT_VERSION='1'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
TARGET_OS='ubuntu'
TARGET_VERSION='26.04'
TARGET_ARCH='amd64'
OUTPUT_BASE="${PWD}/dist"
WITH_NVIDIA='1'
EXTRA_IMAGE_LIST=''
EXTRA_IMAGE_ARCHIVE=''
CONTENT_DIR=''
WITH_APPS=''
LIST_APPS='0'
USE_LOCAL_IMAGES='0'
BUILD_ADMIN='0'

# The apps behind Easy Setup's three core capabilities — Information Library
# (Kiwix), Education Platform (Kolibri) and the AI Assistant (Ollama, with Qdrant
# for its knowledge base). Without these an air-gapped target can offer none of
# them: the wizard only lets you select a capability whose image is already
# present, so a bundle missing them greys out the very choices onboarding is
# built around. Large — Ollama and Kolibri are multi-GB — which is why this is a
# named set rather than part of the light default.
CORE_APP_SET='kiwix,kolibri_gen2,ollama,qdrant'

# Supply Depot apps whose images are worth carrying by default: broadly useful,
# and modest in size compared with the AI/education stack.
DEFAULT_APP_SET='kiwix,cyberchef,it_tools,flatnotes,excalidraw,filebrowser,stirling_pdf'
CREATE_ARCHIVE='0'

# Host packages installed on the target from the bundle. Must stay in step with
# the package list in install_packages_from_artifacts (install_nomad.sh).
ARTIFACT_PACKAGES=(
  ca-certificates
  curl
  gnupg
  jq
  pciutils
  docker-ce
  docker-ce-cli
  containerd.io
  docker-buildx-plugin
  docker-compose-plugin
)

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Functions                                                                                             #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

log() { echo -e "${YELLOW}#${RESET} $*"; }
ok() { echo -e "${GREEN}#${RESET} $*"; }
die() {
  echo -e "${RED}#${RESET} $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Project NOMAD Offline Artifact Bundle Builder

Usage:
  ./build_offline_bundle.sh [options]

Options:
  --repo PATH                  Project NOMAD source checkout (default: the
                               parent directory of this script)
  --target OS:VERSION          Target operating system (default: ubuntu:26.04)
  --arch ARCH                  Target architecture (default: amd64)
  --output DIR                 Directory to create the bundle in (default: ./dist)
  --with-apps LIST             Also bundle Supply Depot app images so apps can
                               be installed on the offline target. LIST is a
                               comma-separated set of app names and/or the named
                               sets "core" (the three Easy Setup capabilities),
                               "default" (a light starter set) or "all". Sets
                               combine: --with-apps core,default. Adds
                               significant size — see --list-apps.
  --list-apps                  Print the installable app names and exit
  --build-admin                Build the Command Center image from this checkout
                               and bundle that instead of the published one, so
                               the bundle carries the code you have rather than
                               the last release. Implies --use-local-images.
  --use-local-images           Skip the registry pull for any image already
                               present in the local Docker daemon. Lets a bundle
                               carry an image built from this checkout (e.g. an
                               unreleased Command Center) instead of the
                               published tag. Images that are NOT local are
                               still pulled as usual.
  --without-nvidia-toolkit     Omit the NVIDIA Container Toolkit packages
  --extra-image-list FILE      Also pull and bundle the image references in FILE
  --extra-image-archive FILE   Copy an existing docker-save archive into the
                               bundle as images/optional-images.tar
  --content-dir DIR            Copy pre-staged NOMAD storage content into the bundle
  --archive                    Also produce a .tar.gz of the finished bundle
  -h, --help                   Show this help text and exit

Requirements on the build machine:
  internet access, docker with compose v2, git, sha256sum, gzip, tar

The bundle is specific to one OS, version and architecture, and carries the
install_nomad.sh from the source checkout it was built from.
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        [[ $# -ge 2 ]] || die "--repo requires a path."
        REPO_ROOT="$(cd -- "$2" 2>/dev/null && pwd)" || die "Source checkout not found: $2"
        shift
        ;;
      --target)
        [[ $# -ge 2 ]] || die "--target requires OS:VERSION."
        [[ "$2" == *:* ]] || die "--target must be given as OS:VERSION (for example ubuntu:26.04)."
        TARGET_OS="${2%%:*}"
        TARGET_VERSION="${2#*:}"
        shift
        ;;
      --arch)
        [[ $# -ge 2 ]] || die "--arch requires a value."
        TARGET_ARCH="$2"
        shift
        ;;
      --output)
        [[ $# -ge 2 ]] || die "--output requires a directory."
        OUTPUT_BASE="$2"
        shift
        ;;
      --with-apps)
        [[ $# -ge 2 ]] || die "--with-apps requires a list, \"default\" or \"all\"."
        WITH_APPS="$2"
        shift
        ;;
      --list-apps)
        LIST_APPS='1'
        ;;
      --without-nvidia-toolkit)
        WITH_NVIDIA='0'
        ;;
      --extra-image-list)
        [[ $# -ge 2 ]] || die "--extra-image-list requires a file."
        EXTRA_IMAGE_LIST="$2"
        shift
        ;;
      --extra-image-archive)
        [[ $# -ge 2 ]] || die "--extra-image-archive requires a file."
        EXTRA_IMAGE_ARCHIVE="$2"
        shift
        ;;
      --content-dir)
        [[ $# -ge 2 ]] || die "--content-dir requires a directory."
        CONTENT_DIR="$2"
        shift
        ;;
      --use-local-images)
        USE_LOCAL_IMAGES='1'
        ;;
      --build-admin)
        BUILD_ADMIN='1'
        USE_LOCAL_IMAGES='1'
        ;;
      --archive)
        CREATE_ARCHIVE='1'
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
}

check_build_requirements() {
  local cmd
  for cmd in docker git sha256sum awk sed gzip tar; do
    command -v "$cmd" > /dev/null 2>&1 ||
      die "Required build command not found: ${cmd}. Run build_offline_bundle_docker.sh instead, which supplies a complete build environment and needs only Docker."
  done

  docker compose version > /dev/null 2>&1 ||
    die "Docker Compose v2 is required on the build machine."

  [[ -f "${REPO_ROOT}/install/install_nomad.sh" ]] ||
    die "install/install_nomad.sh not found under ${REPO_ROOT}. Point --repo at a Project NOMAD checkout."
  [[ -f "${REPO_ROOT}/install/management_compose.yaml" ]] ||
    die "install/management_compose.yaml not found under ${REPO_ROOT}."

  git -C "${REPO_ROOT}" rev-parse HEAD > /dev/null 2>&1 ||
    die "${REPO_ROOT} is not a git checkout, so the bundle commit cannot be recorded."

  # The upstream installer supports x86_64 only. Widening this belongs with the
  # architecture support work, not here.
  [[ "${TARGET_ARCH}" == 'amd64' ]] ||
    die "This builder currently supports --arch amd64 only, matching the installer's supported architecture."
}

detect_target_os_release() {
  # The manifest must record the values install_nomad.sh compares against
  # /etc/os-release on the target, which are not always the image tag (for
  # example debian:12 reports VERSION_ID=12, but a "bookworm" tag would not).
  local os_release
  os_release="$(docker run --rm --platform "linux/${TARGET_ARCH}" "${TARGET_OS}:${TARGET_VERSION}" cat /etc/os-release)" ||
    die "Could not read /etc/os-release from ${TARGET_OS}:${TARGET_VERSION}."

  local detected_id detected_version
  detected_id="$(echo "${os_release}" | awk -F= '$1 == "ID" { gsub(/^"|"$/, "", $2); print $2; exit }')"
  detected_version="$(echo "${os_release}" | awk -F= '$1 == "VERSION_ID" { gsub(/^"|"$/, "", $2); print $2; exit }')"

  [[ -n "${detected_id}" && -n "${detected_version}" ]] ||
    die "${TARGET_OS}:${TARGET_VERSION} does not report a usable ID/VERSION_ID."

  if [[ "${detected_id}" != "${TARGET_OS}" ]]; then
    die "Image ${TARGET_OS}:${TARGET_VERSION} reports ID=${detected_id}. Use --target ${detected_id}:${TARGET_VERSION}."
  fi

  if [[ "${detected_version}" != "${TARGET_VERSION}" ]]; then
    log "Recording TARGET_VERSION=${detected_version} (reported by ${TARGET_OS}:${TARGET_VERSION})."
    TARGET_VERSION="${detected_version}"
  fi
}

copy_installer_and_payload() {
  # The bundle carries the ordinary installer from this exact checkout, so the
  # target runs the same code that was reviewed and built against.
  cp "${REPO_ROOT}/install/install_nomad.sh" "${BUNDLE_DIR}/install_nomad.sh"
  chmod 0755 "${BUNDLE_DIR}/install_nomad.sh"

  local name
  for name in management_compose.yaml start_nomad.sh stop_nomad.sh update_nomad.sh; do
    [[ -f "${REPO_ROOT}/install/${name}" ]] || die "Expected ${REPO_ROOT}/install/${name} to exist."
    cp "${REPO_ROOT}/install/${name}" "${BUNDLE_DIR}/payload/nomad/${name}"
  done

  # A disconnected host cannot fetch the uninstall script later, so ship it when
  # the checkout has one.
  if [[ -f "${REPO_ROOT}/install/uninstall_nomad.sh" ]]; then
    cp "${REPO_ROOT}/install/uninstall_nomad.sh" "${BUNDLE_DIR}/payload/nomad/uninstall_nomad.sh"
  fi

  ok "Copied installer and payload from ${REPO_ROOT}."
}

target_packages() {
  local packages=("${ARTIFACT_PACKAGES[@]}")
  [[ "${WITH_NVIDIA}" != '1' ]] || packages+=(nvidia-container-toolkit)
  echo "${packages[*]}"
}

fetch_third_party_apt_config() {
  # Fetching the Docker and NVIDIA repository keys needs curl and gnupg, which
  # would pollute the package set of whatever container installs them. So this
  # runs in a throwaway container and hands the resulting files to the resolver,
  # which must stay pristine.
  local config_dir="$1"

  # -i is required: the build steps are fed to the container over stdin.
  docker run --rm -i \
    --platform "linux/${TARGET_ARCH}" \
    -e TARGET_OS="${TARGET_OS}" \
    -e WITH_NVIDIA="${WITH_NVIDIA}" \
    -v "${config_dir}:/aptcfg" \
    "${TARGET_OS}:${TARGET_VERSION}" \
    bash -s <<'CONTAINER_SCRIPT' || die "Failed to fetch third-party APT repository configuration."
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg

. /etc/os-release

# The resolver needs to reach HTTPS repositories without installing
# ca-certificates (which would take openssl out of the dependency closure), so
# hand it the trust store as a plain file.
cp /etc/ssl/certs/ca-certificates.crt /aptcfg/ca-certificates.crt

curl -fsSL "https://download.docker.com/linux/${TARGET_OS}/gpg" -o /aptcfg/docker.asc
chmod a+r /aptcfg/docker.asc

arch="$(dpkg --print-architecture)"
echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${TARGET_OS} ${VERSION_CODENAME} stable" \
  > /aptcfg/docker.list

if [[ "${WITH_NVIDIA}" == '1' ]]; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /aptcfg/nvidia-container-toolkit-keyring.gpg

  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/etc/apt/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    > /aptcfg/nvidia-container-toolkit.list
fi
CONTAINER_SCRIPT
}

build_local_apt_repo() {
  local out_dir="${BUNDLE_DIR}/packages/apt"
  local config_dir
  config_dir="$(mktemp -d)" || die "Could not create a temporary directory."

  log "Building local APT repository for ${TARGET_OS} ${TARGET_VERSION} (${TARGET_ARCH})..."

  fetch_third_party_apt_config "${config_dir}"

  # Resolve the closure in a PRISTINE container of the target distribution.
  # APT only downloads packages that are not already installed, so anything
  # installed here first would silently drop out of the bundle and fail on the
  # target. A base image is a subset of any real install of the same release,
  # so its closure is a superset of what the target needs.
  docker run --rm -i \
    --platform "linux/${TARGET_ARCH}" \
    -e PACKAGES="$(target_packages)" \
    -v "${config_dir}:/aptcfg:ro" \
    -v "${out_dir}:/out" \
    "${TARGET_OS}:${TARGET_VERSION}" \
    bash -s <<'CONTAINER_SCRIPT' || die "Failed to resolve the host package closure."
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive

# File copies only — installing packages at this point would corrupt the closure.
install -m 0755 -d /etc/apt/keyrings
install -m 0644 /aptcfg/docker.asc /etc/apt/keyrings/docker.asc
install -m 0644 /aptcfg/docker.list /etc/apt/sources.list.d/docker.list
if [[ -f /aptcfg/nvidia-container-toolkit-keyring.gpg ]]; then
  install -m 0644 /aptcfg/nvidia-container-toolkit-keyring.gpg /etc/apt/keyrings/nvidia-container-toolkit-keyring.gpg
  install -m 0644 /aptcfg/nvidia-container-toolkit.list /etc/apt/sources.list.d/nvidia-container-toolkit.list
fi

# The Docker and NVIDIA repositories are HTTPS. Point APT at the trust store
# supplied by the fetcher rather than installing ca-certificates, which would
# take openssl out of the dependency closure.
apt_opts=(-o "Acquire::https::CaInfo=/aptcfg/ca-certificates.crt")

apt-get "${apt_opts[@]}" update

read -ra packages <<< "${PACKAGES}"
apt-get "${apt_opts[@]}" install -y --download-only --reinstall "${packages[@]}"

cp /var/cache/apt/archives/*.deb /out/

# Only now, with the closure already copied out, is it safe to install the
# tooling that generates the package index.
apt-get "${apt_opts[@]}" install -y --no-install-recommends dpkg-dev
cd /out
dpkg-scanpackages . /dev/null > Packages
gzip -9c Packages > Packages.gz
CONTAINER_SCRIPT

  rm -rf "${config_dir}"

  [[ -s "${out_dir}/Packages" && -s "${out_dir}/Packages.gz" ]] ||
    die "Local APT repository generation failed — no package index was produced."

  local deb_count
  deb_count="$(find "${out_dir}" -maxdepth 1 -name '*.deb' ! -name '._*' | wc -l | tr -d ' ')"
  [[ "${deb_count}" -gt 0 ]] || die "Local APT repository contains no .deb packages."

  ok "Local APT repository created (${deb_count} packages)."
}

verify_local_apt_repo() {
  local out_dir="${BUNDLE_DIR}/packages/apt"

  log "Verifying the local APT repository resolves with no network..."

  # Dry-run the exact isolated installation the target performs, in a clean
  # container of the target distribution with no network at all. An incomplete
  # closure fails here, on the build machine, instead of in the field.
  docker run --rm -i \
    --platform "linux/${TARGET_ARCH}" \
    --network none \
    -e PACKAGES="$(target_packages)" \
    -v "${out_dir}:/repo:ro" \
    "${TARGET_OS}:${TARGET_VERSION}" \
    bash -s <<'CONTAINER_SCRIPT' || die "The bundled APT repository cannot satisfy its own package list offline. The bundle would fail on the target."
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive

mkdir -p /tmp/apt/lists/partial
echo 'deb [trusted=yes] file:/repo ./' > /tmp/apt/sources.list

apt_opts=(
  -o Dir::Etc::sourcelist=/tmp/apt/sources.list
  -o Dir::Etc::sourceparts=-
  -o Dir::State::Lists=/tmp/apt/lists
  -o APT::Get::List-Cleanup=0
  -o Acquire::Languages=none
  -o Acquire::Retries=0
)

apt-get "${apt_opts[@]}" update
read -ra packages <<< "${PACKAGES}"
apt-get "${apt_opts[@]}" install -y --no-install-recommends --simulate "${packages[@]}"
CONTAINER_SCRIPT

  ok "Local APT repository resolves offline."
}

# Make an image available locally so `docker save` can write it into the bundle.
#
# Normally that means pulling the published tag. With --use-local-images, an
# image already in the daemon is taken as-is: the point is to bundle a Command
# Center built from this checkout rather than the released
# ghcr.io/crosstalk-solutions/project-nomad:latest that management_compose.yaml
# pins, so unreleased changes can be tested on an air-gapped target. Images that
# are not present locally are still pulled, so the flag never silently produces
# a bundle with something missing.
#
# Deliberately narrow: it does not verify the local image resembles the tag it
# claims. A bundle built this way carries whatever you built, which is the whole
# point — and the reason it is opt-in rather than the default.
acquire_image() {
  local image="$1"

  if [[ "${USE_LOCAL_IMAGES}" == '1' ]] && docker image inspect "${image}" >/dev/null 2>&1; then
    log "Using local ${image} (not pulling)."
    return 0
  fi

  log "Pulling ${image}..."
  docker pull --platform "linux/${TARGET_ARCH}" "${image}"
}

# Build the Command Center from this checkout, tagged as the reference
# management_compose.yaml pins, so the rest of the build bundles it in place of
# the published image.
#
# Without this a bundle always carries the last RELEASE, no matter what is in the
# tree it was built from — which makes an admin-side change impossible to test on
# an air-gapped target. The image reference is read from the compose file rather
# than hardcoded so a fork's own tag is honoured.
build_admin_image() {
  [[ "${BUILD_ADMIN}" == '1' ]] || return 0

  local compose_file="${REPO_ROOT}/install/management_compose.yaml"
  local admin_image
  admin_image="$(docker compose -f "${compose_file}" config --images |
    grep -m1 'project-nomad:' || true)"
  [[ -n "${admin_image}" ]] ||
    die "Could not determine the Command Center image reference from ${compose_file}."

  log "Building ${admin_image} from ${REPO_ROOT} (this takes a few minutes)..."
  docker build --platform "linux/${TARGET_ARCH}" -t "${admin_image}" "${REPO_ROOT}" ||
    die "Failed to build the Command Center image from ${REPO_ROOT}."

  ok "Built ${admin_image} from this checkout."
}

discover_and_save_images() {
  local compose_file="${REPO_ROOT}/install/management_compose.yaml"
  local image_list="${BUNDLE_DIR}/images/core-images.txt"

  log "Discovering management images from management_compose.yaml..."
  docker compose -f "${compose_file}" config --images | sort -u > "${image_list}" ||
    die "Could not read service images from ${compose_file}."

  if [[ -n "${EXTRA_IMAGE_LIST}" ]]; then
    [[ -f "${EXTRA_IMAGE_LIST}" ]] || die "Extra image list not found: ${EXTRA_IMAGE_LIST}"
    grep -Ev '^[[:space:]]*(#|$)' "${EXTRA_IMAGE_LIST}" >> "${image_list}" || true
    sort -u -o "${image_list}" "${image_list}"
  fi

  # Read with a loop rather than mapfile so the builder also runs under the
  # bash 3.2 that ships with macOS.
  local images=()
  local image
  while IFS= read -r image; do
    [[ -n "${image}" ]] || continue
    images+=("${image}")
  done < "${image_list}"
  [[ ${#images[@]} -gt 0 ]] || die "No images were discovered from ${compose_file}."

  for image in "${images[@]}"; do
    acquire_image "${image}" ||
      die "Failed to pull ${image}. The build machine needs internet access and registry availability."
  done

  log "Saving ${#images[@]} image(s) to images/core-images.tar..."
  docker save -o "${BUNDLE_DIR}/images/core-images.tar" "${images[@]}" ||
    die "docker save failed."

  {
    printf 'IMAGE\tID\tREPO_DIGESTS\n'
    for image in "${images[@]}"; do
      printf '%s\t%s\t%s\n' \
        "${image}" \
        "$(docker image inspect --format '{{.Id}}' "${image}")" \
        "$(docker image inspect --format '{{join .RepoDigests ","}}' "${image}")"
    done
  } > "${BUNDLE_DIR}/images/core-image-metadata.tsv"

  ok "Saved ${#images[@]} management image(s)."
}

app_seeder_path() {
  echo "${REPO_ROOT}/admin/database/seeders/service_seeder.ts"
}

# Supply Depot apps are seeded into the Command Center's database from a file
# baked into the admin image — the catalog is local, not fetched — so reading the
# same file here keeps bundled images in step with what the UI will offer.
discover_app_images() {
  local seeder
  seeder="$(app_seeder_path)"
  [[ -f "${seeder}" ]] || die "Could not find the app seeder at ${seeder}."

  awk '
    /service_name: SERVICE_NAMES\./ {
      name = $0
      sub(/.*SERVICE_NAMES\./, "", name)
      sub(/,.*/, "", name)
    }
    /container_image: '"'"'/ {
      image = $0
      sub(/.*container_image: '"'"'/, "", image)
      sub(/'"'"'.*/, "", image)
      if (name != "") {
        print tolower(name) "\t" image
        name = ""
      }
    }
  ' "${seeder}"
}

list_apps() {
  echo 'Supply Depot apps available to bundle with --with-apps:'
  echo ''
  local name image
  while IFS="$(printf '\t')" read -r name image; do
    [[ -n "${name}" ]] || continue
    printf '  %-16s %s\n' "${name}" "${image}"
  done < <(discover_app_images)
  echo ''
  echo "Named sets:"
  echo "  core     ${CORE_APP_SET}"
  echo "           (Easy Setup's three core capabilities — needed for the target"
  echo "            to offer them offline)"
  echo "  default  ${DEFAULT_APP_SET}"
  echo "  all      every app listed above"
  echo
  echo 'Sets combine with each other and with individual names:'
  echo '  --with-apps core,default'
}

# Resolves WITH_APPS into the image references to bundle.
selected_app_images() {
  local requested="${WITH_APPS}"

  # Expand the named sets anywhere in the list, so "core,default" and
  # "core,jellyfin" work rather than only a bare set name. Duplicates are
  # harmless — the caller sorts -u before pulling.
  local expanded='' part
  IFS=',' read -ra parts <<< "${requested}"
  for part in "${parts[@]}"; do
    part="$(echo "${part}" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
    case "${part}" in
      '')        continue ;;
      core)      expanded="${expanded},${CORE_APP_SET}" ;;
      default)   expanded="${expanded},${DEFAULT_APP_SET}" ;;
      *)         expanded="${expanded},${part}" ;;
    esac
  done
  requested="${expanded#,}"

  local name image
  if [[ ",${requested}," == *,all,* ]]; then
    while IFS="$(printf '\t')" read -r name image; do
      [[ -n "${image}" ]] || continue
      echo "${image}"
    done < <(discover_app_images)
    return 0
  fi

  # Validate every requested name so a typo fails the build rather than silently
  # producing a bundle without the app the user asked for.
  local available
  available="$(discover_app_images)"
  local wanted
  IFS=',' read -ra wanted <<< "${requested}"
  local entry match
  for entry in "${wanted[@]}"; do
    entry="$(echo "${entry}" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
    [[ -n "${entry}" ]] || continue
    match="$(echo "${available}" | awk -F'\t' -v want="${entry}" '$1 == want { print $2; exit }')"
    [[ -n "${match}" ]] ||
      die "Unknown app '${entry}'. Run --list-apps to see the available names."
    echo "${match}"
  done
}

bundle_app_images() {
  [[ -n "${WITH_APPS}" ]] || return 0

  local images=()
  local image
  while IFS= read -r image; do
    [[ -n "${image}" ]] || continue
    images+=("${image}")
  done < <(selected_app_images | sort -u)

  [[ ${#images[@]} -gt 0 ]] || die "--with-apps selected no images."

  log "Bundling ${#images[@]} Supply Depot app image(s)..."
  for image in "${images[@]}"; do
    acquire_image "${image}" || die "Failed to pull ${image}."
  done

  printf '%s\n' "${images[@]}" > "${BUNDLE_DIR}/images/app-images.txt"
  docker save -o "${BUNDLE_DIR}/images/app-images.tar" "${images[@]}" ||
    die "Failed to save app images."

  ok "Saved ${#images[@]} app image(s)."

  # Kiwix refuses to install without at least one ZIM present, and its
  # pre-install step fetches one from GitHub. Carry the small Wikipedia sample
  # from this checkout so the file is already in storage on the target.
  if printf '%s\n' "${images[@]}" | grep -q 'kiwix'; then
    local zim
    zim="$(find "${REPO_ROOT}/install" -maxdepth 1 -name 'wikipedia_en_*.zim' ! -name '._*' | sort | tail -1)"
    if [[ -n "${zim}" ]]; then
      mkdir -p "${BUNDLE_DIR}/content/zim"
      cp "${zim}" "${BUNDLE_DIR}/content/zim/$(basename "${zim}")"
      ok "Included $(basename "${zim}") for Kiwix."
    else
      log "Warning: no wikipedia_en_*.zim found in the checkout; Kiwix will have no starter content."
    fi
  fi
}

write_pull_never_override() {
  # Kept separate from service discovery so it can be unit tested without Docker.
  local override_path="$1"
  shift
  local services=("$@")

  [[ ${#services[@]} -gt 0 ]] || die "Refusing to write a Compose override with no services."

  {
    echo "# Generated by install/build_offline_bundle.sh — do not edit."
    echo "#"
    echo "# Layered over compose.yml during artifact-mode installs so that every service"
    echo "# uses the images loaded from the bundle instead of contacting a registry."
    echo "services:"
    local service
    for service in "${services[@]}"; do
      echo "  ${service}:"
      echo "    pull_policy: never"
    done
  } > "${override_path}"
}

generate_pull_never_override() {
  local compose_file="${REPO_ROOT}/install/management_compose.yaml"
  local services=()
  local service
  while IFS= read -r service; do
    [[ -n "${service}" ]] || continue
    services+=("${service}")
  done < <(docker compose -f "${compose_file}" config --services | sort)
  [[ ${#services[@]} -gt 0 ]] || die "No Compose services were discovered from ${compose_file}."

  write_pull_never_override "${BUNDLE_DIR}/payload/nomad/compose.artifact.yml" "${services[@]}"
  ok "Generated pull_policy: never override for ${#services[@]} service(s)."
}

add_optional_content() {
  if [[ -n "${EXTRA_IMAGE_ARCHIVE}" ]]; then
    [[ -f "${EXTRA_IMAGE_ARCHIVE}" ]] || die "Extra image archive not found: ${EXTRA_IMAGE_ARCHIVE}"
    log "Adding optional image archive..."
    cp "${EXTRA_IMAGE_ARCHIVE}" "${BUNDLE_DIR}/images/optional-images.tar"
  fi

  if [[ -n "${CONTENT_DIR}" ]]; then
    [[ -d "${CONTENT_DIR}" ]] || die "Content directory not found: ${CONTENT_DIR}"
    log "Copying pre-staged NOMAD storage content..."
    mkdir -p "${BUNDLE_DIR}/content"
    cp -a "${CONTENT_DIR}/." "${BUNDLE_DIR}/content/"
  fi
}

write_manifest() {
  # Plain data, read key by key on the target. Never sourced as shell.
  cat > "${BUNDLE_DIR}/manifest" <<EOF
BUNDLE_FORMAT_VERSION=${BUNDLE_FORMAT_VERSION}
NOMAD_COMMIT=${NOMAD_COMMIT}
TARGET_OS=${TARGET_OS}
TARGET_VERSION=${TARGET_VERSION}
TARGET_ARCH=${TARGET_ARCH}
WITH_NVIDIA_TOOLKIT=${WITH_NVIDIA}
USED_LOCAL_IMAGES=${USE_LOCAL_IMAGES}
CREATED_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

  cat > "${BUNDLE_DIR}/README.txt" <<EOF
Project NOMAD Offline Artifact Bundle
=====================================

NOMAD commit : ${NOMAD_COMMIT}
Target       : ${TARGET_OS} ${TARGET_VERSION} (${TARGET_ARCH})
$(if [[ "${USE_LOCAL_IMAGES}" == '1' ]]; then
  printf '\nNOTE: Built with --use-local-images. One or more images came from the\n'
  printf 'build machine rather than a registry, so this bundle may carry\n'
  printf 'unreleased code. Not for distribution.\n'
fi)
Install on a matching, disconnected target:

  sudo bash ./install_nomad.sh --artifacts .

Artifact mode never falls back to the network. If a required package, image or
payload file is missing from this bundle, the installation stops with an error.

The SHA256SUMS file verifies that this bundle transferred intact. It is not a
publisher signature.
EOF
}

write_checksums() {
  # Bundles are routinely built straight onto FAT/exFAT removable media, where
  # macOS deposits AppleDouble sidecars ("._name") and .DS_Store alongside real
  # files. They are OS metadata, not bundle content: they appear and vanish
  # outside our control, so checksumming them produces a bundle that fails its
  # own verification. Remove them, and never list them.
  find "${BUNDLE_DIR}" -type f \( -name '._*' -o -name '.DS_Store' \) -delete 2>/dev/null || true

  log "Generating SHA-256 checksums..."
  (
    cd "${BUNDLE_DIR}"
    find . -type f ! -name SHA256SUMS ! -name '._*' ! -name '.DS_Store' -print0 \
      | sort -z | xargs -0 sha256sum > SHA256SUMS
  )
  (
    cd "${BUNDLE_DIR}"
    sha256sum -c SHA256SUMS > /dev/null
  ) || die "Checksum verification of the finished bundle failed."
  ok "Checksums written and verified."
}

main() {
  parse_args "$@"

  if [[ "${LIST_APPS}" == '1' ]]; then
    list_apps
    exit 0
  fi

  check_build_requirements
  detect_target_os_release

  NOMAD_COMMIT="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  BUNDLE_NAME="project-nomad-offline-${TARGET_OS}-${TARGET_VERSION}-${TARGET_ARCH}-${NOMAD_COMMIT:0:12}"
  BUNDLE_DIR="${OUTPUT_BASE%/}/${BUNDLE_NAME}"

  if ! git -C "${REPO_ROOT}" diff --quiet HEAD 2>/dev/null; then
    log "Warning: ${REPO_ROOT} has uncommitted changes. The manifest records ${NOMAD_COMMIT:0:12} regardless."
  fi

  log "Building ${BUNDLE_NAME}"
  rm -rf "${BUNDLE_DIR}"
  mkdir -p "${BUNDLE_DIR}/packages/apt" "${BUNDLE_DIR}/images" "${BUNDLE_DIR}/payload/nomad"

  copy_installer_and_payload
  build_admin_image
  build_local_apt_repo
  verify_local_apt_repo
  discover_and_save_images
  bundle_app_images
  generate_pull_never_override
  add_optional_content
  write_manifest
  write_checksums

  if [[ "${CREATE_ARCHIVE}" == '1' ]]; then
    log "Creating ${BUNDLE_DIR}.tar.gz..."
    tar -C "${OUTPUT_BASE%/}" -czf "${BUNDLE_DIR}.tar.gz" "${BUNDLE_NAME}"
    ok "Created ${BUNDLE_DIR}.tar.gz"
  fi

  echo ''
  ok "Bundle ready: ${BUNDLE_DIR}"
  echo ''
  echo -e "${GREEN}#${RESET} Copy it to the target and run:"
  echo -e "${GREEN}#${RESET}   sudo bash ./install_nomad.sh --artifacts ."
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Main Script                                                                                           #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

# The test suite sources this script to exercise individual functions. Every
# other invocation builds a bundle normally.
if [[ "${NOMAD_BUNDLE_LIB_ONLY:-}" == '1' ]]; then
  return 0 2>/dev/null || exit 0
fi

main "$@"
