#!/bin/bash

# Project NOMAD Offline Artifact Bundle Verifier

###################################################################################################################################################################################################
#
# Inspects and verifies an offline artifact bundle without installing anything.
#
# Useful before transferring a bundle to removable media, and on the target
# before running the installer. Runs entirely offline.
#
# Usage:
#   ./verify_offline_bundle.sh [/path/to/bundle]
#
###################################################################################################################################################################################################

set -Eeuo pipefail

RESET='\033[0m'
RED='\033[1;31m'
GREEN='\033[1;32m'

die() {
  echo -e "${RED}#${RESET} $*" >&2
  exit 1
}

BUNDLE="${1:-.}"
BUNDLE="$(cd -- "${BUNDLE}" 2>/dev/null && pwd)" || die "Bundle directory not found: ${1:-.}"

command -v sha256sum > /dev/null 2>&1 || die "sha256sum is required."

manifest_get() {
  local key="$1"
  awk -F= -v wanted="${key}" '$1 == wanted { sub(/^[^=]*=/, "", $0); print; exit }' "${BUNDLE}/manifest"
}

# Same required set the installer enforces, so a bundle that passes here will
# not fail validation on the target for a missing file.
required_files=(
  manifest
  SHA256SUMS
  install_nomad.sh
  packages/apt/Packages
  packages/apt/Packages.gz
  images/core-images.txt
  images/core-images.tar
  payload/nomad/management_compose.yaml
  payload/nomad/compose.artifact.yml
  payload/nomad/start_nomad.sh
  payload/nomad/stop_nomad.sh
  payload/nomad/update_nomad.sh
)

for required_file in "${required_files[@]}"; do
  [[ -f "${BUNDLE}/${required_file}" ]] || die "Bundle is incomplete. Missing: ${required_file}"
done

echo "Verifying checksums..."
(cd "${BUNDLE}" && sha256sum -c SHA256SUMS > /dev/null) ||
  die "Checksum verification failed — the bundle is corrupt or incomplete."

# ! -name '._*' skips macOS AppleDouble sidecars left on FAT/exFAT media.
deb_count="$(find "${BUNDLE}/packages/apt" -maxdepth 1 -name '*.deb' ! -name '._*' | wc -l | tr -d ' ')"
[[ "${deb_count}" -gt 0 ]] || die "Bundle contains no .deb packages."

image_count="$(grep -c '[^[:space:]]' "${BUNDLE}/images/core-images.txt" || true)"
[[ "${image_count}" -gt 0 ]] || die "Bundle lists no management images."

# Every service in the bundled compose file must appear in the pull-never
# override, or that service would still try to reach a registry on the target.
missing_overrides=''
while IFS= read -r service; do
  grep -qE "^[[:space:]]+${service}:[[:space:]]*$" "${BUNDLE}/payload/nomad/compose.artifact.yml" ||
    missing_overrides="${missing_overrides} ${service}"
done < <(awk '
  /^services:[[:space:]]*$/ { in_services = 1; next }
  /^[^[:space:]#]/ { in_services = 0 }
  in_services && /^  [A-Za-z0-9._-]+:[[:space:]]*$/ {
    gsub(/^  |:[[:space:]]*$/, "", $0)
    print
  }
' "${BUNDLE}/payload/nomad/management_compose.yaml")

[[ -z "${missing_overrides}" ]] ||
  die "compose.artifact.yml is missing pull_policy overrides for:${missing_overrides}"

echo ''
printf 'Bundle format : %s\n' "$(manifest_get BUNDLE_FORMAT_VERSION)"
printf 'NOMAD commit  : %s\n' "$(manifest_get NOMAD_COMMIT)"
printf 'Target        : %s %s (%s)\n' \
  "$(manifest_get TARGET_OS)" "$(manifest_get TARGET_VERSION)" "$(manifest_get TARGET_ARCH)"
printf 'NVIDIA toolkit: %s\n' "$(manifest_get WITH_NVIDIA_TOOLKIT)"
printf 'Created (UTC) : %s\n' "$(manifest_get CREATED_AT_UTC)"
printf 'Packages      : %s .deb files\n' "${deb_count}"
printf 'Images        : %s\n' "${image_count}"
echo ''
echo -e "${GREEN}#${RESET} Bundle verified. Checksums confirm transfer integrity, not publisher identity."
