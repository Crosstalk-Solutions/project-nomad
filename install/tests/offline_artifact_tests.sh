#!/bin/bash

# Project NOMAD Offline Artifact Mode Regression Tests

###################################################################################################################################################################################################
#
# Guards the fail-closed behaviour of install_nomad.sh --artifacts and the bundle
# builder. Runs offline and needs no Docker daemon.
#
# Requires a Linux host (the installer reads /etc/os-release and dpkg). Run it
# from anywhere:
#
#   bash install/tests/offline_artifact_tests.sh
#
# Or in a container from the repository root:
#
#   docker run --rm --network none -v "$PWD:/repo" -w /repo ubuntu:26.04 \
#     bash install/tests/offline_artifact_tests.sh
#
###################################################################################################################################################################################################

set -uo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(cd -- "${TESTS_DIR}/.." && pwd)"
INSTALLER="${INSTALL_DIR}/install_nomad.sh"
BUILDER="${INSTALL_DIR}/build_offline_bundle.sh"
COMPOSE_FILE="${INSTALL_DIR}/management_compose.yaml"

pass_count=0
fail_count=0

pass() {
  pass_count=$((pass_count + 1))
  echo "  ok   - $1"
}

fail() {
  fail_count=$((fail_count + 1))
  echo "  FAIL - $1"
  [[ $# -lt 2 ]] || echo "         $2"
}

assert_eq() {
  local expected="$1" actual="$2" name="$3"
  if [[ "${expected}" == "${actual}" ]]; then
    pass "${name}"
  else
    fail "${name}" "expected '${expected}', got '${actual}'"
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" name="$3"
  if [[ "${haystack}" == *"${needle}"* ]]; then
    pass "${name}"
  else
    fail "${name}" "expected to find '${needle}'"
  fi
}

assert_not_contains() {
  local haystack="$1" needle="$2" name="$3"
  if [[ "${haystack}" != *"${needle}"* ]]; then
    pass "${name}"
  else
    fail "${name}" "did not expect to find '${needle}'"
  fi
}

# Run a snippet against the installer's functions without running the installer.
installer_eval() {
  NOMAD_INSTALLER_LIB_ONLY='1' bash -c "source '${INSTALLER}'; $1"
}

# Same, capturing the exit status of a snippet expected to fail.
installer_status() {
  installer_eval "$1" > /dev/null 2>&1
  echo "$?"
}

# Print the body of a shell function, relying on the closing brace being in
# column 0 as it is throughout these scripts.
extract_function() {
  awk -v fn="$1" '
    $0 ~ "^" fn "\\(\\) \\{" { inside = 1; next }
    inside && /^\}/ { exit }
    inside { print }
  ' "$2"
}

# Service names declared in the management compose file, parsed without Docker.
compose_services() {
  awk '
    /^services:[[:space:]]*$/ { in_services = 1; next }
    /^[^[:space:]#]/ { in_services = 0 }
    in_services && /^  [A-Za-z0-9._-]+:[[:space:]]*$/ {
      gsub(/^  |:[[:space:]]*$/, "", $0)
      print
    }
  ' "$1"
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                       Test Fixtures                                                                                             #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/nomad-artifact-tests.XXXXXX")"
trap 'rm -rf "${FIXTURE_ROOT}"' EXIT

host_os="$(awk -F= '$1 == "ID" { gsub(/^"|"$/, "", $2); print $2; exit }' /etc/os-release 2>/dev/null || true)"
host_version="$(awk -F= '$1 == "VERSION_ID" { gsub(/^"|"$/, "", $2); print $2; exit }' /etc/os-release 2>/dev/null || true)"
host_arch="$(dpkg --print-architecture 2>/dev/null || uname -m)"
case "${host_arch}" in
  x86_64|amd64) host_arch='amd64' ;;
  aarch64|arm64) host_arch='arm64' ;;
esac

if [[ -z "${host_os}" || -z "${host_version}" ]]; then
  echo "These tests need a Linux host with /etc/os-release." >&2
  echo "Run them in a container, for example:" >&2
  echo "  docker run --rm --network none -v \"\$PWD:/repo\" -w /repo ubuntu:26.04 \\" >&2
  echo "    bash install/tests/offline_artifact_tests.sh" >&2
  exit 2
fi

# Build a structurally complete bundle. Contents are placeholders — validation
# checks presence, checksums and the manifest, not package internals.
make_fixture_bundle() {
  local bundle="$1"
  local os="${2:-${host_os}}"
  local version="${3:-${host_version}}"
  local arch="${4:-${host_arch}}"
  local format="${5:-1}"

  mkdir -p "${bundle}/packages/apt" "${bundle}/images" "${bundle}/payload/nomad"

  echo 'placeholder' > "${bundle}/install_nomad.sh"
  printf 'Package: docker-ce\n' > "${bundle}/packages/apt/Packages"
  gzip -9c "${bundle}/packages/apt/Packages" > "${bundle}/packages/apt/Packages.gz"
  echo 'placeholder' > "${bundle}/packages/apt/docker-ce.deb"
  printf 'mysql:8.0\nredis:7-alpine\n' > "${bundle}/images/core-images.txt"
  echo 'placeholder' > "${bundle}/images/core-images.tar"

  cp "${COMPOSE_FILE}" "${bundle}/payload/nomad/management_compose.yaml"
  local service
  {
    echo 'services:'
    while IFS= read -r service; do
      echo "  ${service}:"
      echo '    pull_policy: never'
    done < <(compose_services "${COMPOSE_FILE}")
  } > "${bundle}/payload/nomad/compose.artifact.yml"

  local name
  for name in start_nomad.sh stop_nomad.sh update_nomad.sh; do
    echo 'placeholder' > "${bundle}/payload/nomad/${name}"
  done

  cat > "${bundle}/manifest" <<EOF
BUNDLE_FORMAT_VERSION=${format}
NOMAD_COMMIT=0123456789abcdef0123456789abcdef01234567
TARGET_OS=${os}
TARGET_VERSION=${version}
TARGET_ARCH=${arch}
WITH_NVIDIA_TOOLKIT=1
CREATED_AT_UTC=2026-08-14T00:00:00Z
EOF

  (
    cd "${bundle}" || exit 1
    find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  )
}

VALID_BUNDLE="${FIXTURE_ROOT}/valid"
make_fixture_bundle "${VALID_BUNDLE}"

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                            Tests                                                                                                #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

echo ''
echo '# Argument and environment parsing'

assert_eq 'true' \
  "$(installer_eval "parse_installer_args --artifacts '${VALID_BUNDLE}'; echo \"\${artifact_mode}\"")" \
  '--artifacts PATH enables artifact mode'

assert_eq 'true' \
  "$(installer_eval "parse_installer_args --artifacts='${VALID_BUNDLE}'; echo \"\${artifact_mode}\"")" \
  '--artifacts=PATH enables artifact mode'

assert_eq 'true' \
  "$(NOMAD_ARTIFACT_PATH="${VALID_BUNDLE}" installer_eval 'parse_installer_args; echo "${artifact_mode}"')" \
  'NOMAD_ARTIFACT_PATH enables artifact mode'

mkdir -p "${FIXTURE_ROOT}/from-env"
assert_eq "${VALID_BUNDLE}" \
  "$(NOMAD_ARTIFACT_PATH="${FIXTURE_ROOT}/from-env" installer_eval \
    "parse_installer_args --artifacts '${VALID_BUNDLE}'; echo \"\${NOMAD_ARTIFACT_PATH}\"")" \
  'command line argument wins over NOMAD_ARTIFACT_PATH'

assert_eq 'false' \
  "$(installer_eval 'parse_installer_args; echo "${artifact_mode}"')" \
  'no artifact path leaves artifact mode disabled (online install unchanged)'

assert_eq "${VALID_BUNDLE}/payload/nomad" \
  "$(installer_eval "parse_installer_args --artifacts '${VALID_BUNDLE}'; echo \"\${artifact_payload_dir}\"")" \
  'artifact sub-paths are derived from the bundle root'

assert_eq '1' "$(installer_status 'parse_installer_args --artifacts')" \
  '--artifacts without a value fails'

assert_eq '1' "$(installer_status 'parse_installer_args --artifacts=')" \
  '--artifacts= with an empty value fails'

assert_eq '1' "$(installer_status 'parse_installer_args --not-a-real-flag')" \
  'unknown option fails'

assert_eq '1' "$(installer_status "parse_installer_args --artifacts '${FIXTURE_ROOT}/does-not-exist'")" \
  'missing artifact directory fails'

assert_eq '0' "$(installer_status 'parse_installer_args --help')" \
  '--help exits successfully'

echo ''
echo '# Bundle validation'

assert_eq '0' \
  "$(installer_status "parse_installer_args --artifacts '${VALID_BUNDLE}'; validate_artifact_bundle")" \
  'a complete, matching bundle validates'

corrupt_bundle="${FIXTURE_ROOT}/corrupt"
make_fixture_bundle "${corrupt_bundle}"
echo 'tampered' >> "${corrupt_bundle}/images/core-images.tar"
assert_eq '1' \
  "$(installer_status "parse_installer_args --artifacts '${corrupt_bundle}'; validate_artifact_bundle")" \
  'a bundle failing checksum verification is rejected'

# Pointing --artifacts at a source checkout instead of a bundle is a common
# mistake and must produce a specific, actionable message.
not_a_bundle="${FIXTURE_ROOT}/not-a-bundle"
mkdir -p "${not_a_bundle}"
cp "${INSTALLER}" "${not_a_bundle}/install_nomad.sh"
cp "${COMPOSE_FILE}" "${not_a_bundle}/management_compose.yaml"
not_a_bundle_output="$(installer_eval "parse_installer_args --artifacts '${not_a_bundle}'; validate_artifact_bundle" 2>&1)"
assert_eq '1' \
  "$(installer_status "parse_installer_args --artifacts '${not_a_bundle}'; validate_artifact_bundle")" \
  'a directory that is not a bundle is rejected'
assert_contains "${not_a_bundle_output}" 'is not an offline artifact bundle' \
  'a non-bundle directory gets a specific error, not a missing-file list'
assert_contains "${not_a_bundle_output}" 'build_offline_bundle.sh' \
  'the non-bundle error tells the user how to build one'

no_sums_bundle="${FIXTURE_ROOT}/no-sums"
make_fixture_bundle "${no_sums_bundle}"
rm -f "${no_sums_bundle}/SHA256SUMS"
assert_eq '1' \
  "$(installer_status "parse_installer_args --artifacts '${no_sums_bundle}'; validate_artifact_bundle")" \
  'a bundle without SHA256SUMS is rejected'

for missing in payload/nomad/compose.artifact.yml images/core-images.tar packages/apt/Packages.gz payload/nomad/update_nomad.sh; do
  incomplete="${FIXTURE_ROOT}/incomplete-$(echo "${missing}" | tr '/.' '--')"
  make_fixture_bundle "${incomplete}"
  rm -f "${incomplete}/${missing}"
  assert_eq '1' \
    "$(installer_status "parse_installer_args --artifacts '${incomplete}'; validate_artifact_bundle")" \
    "a bundle missing ${missing} is rejected"
done

incomplete_manifest="${FIXTURE_ROOT}/manifest-incomplete"
make_fixture_bundle "${incomplete_manifest}"
grep -v '^TARGET_ARCH=' "${incomplete_manifest}/manifest" > "${incomplete_manifest}/manifest.tmp"
mv "${incomplete_manifest}/manifest.tmp" "${incomplete_manifest}/manifest"
(cd "${incomplete_manifest}" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
assert_eq '1' \
  "$(installer_status "parse_installer_args --artifacts '${incomplete_manifest}'; validate_artifact_bundle")" \
  'a manifest missing TARGET_ARCH is rejected'

wrong_format="${FIXTURE_ROOT}/wrong-format"
make_fixture_bundle "${wrong_format}" "${host_os}" "${host_version}" "${host_arch}" '99'
assert_eq '1' \
  "$(installer_status "parse_installer_args --artifacts '${wrong_format}'; validate_artifact_bundle")" \
  'an unsupported bundle format version is rejected'

wrong_os="${FIXTURE_ROOT}/wrong-os"
make_fixture_bundle "${wrong_os}" 'definitely-not-this-os'
assert_eq '1' \
  "$(installer_status "parse_installer_args --artifacts '${wrong_os}'; validate_artifact_bundle")" \
  'an OS mismatch is rejected'

wrong_version="${FIXTURE_ROOT}/wrong-version"
make_fixture_bundle "${wrong_version}" "${host_os}" '0.00'
assert_eq '1' \
  "$(installer_status "parse_installer_args --artifacts '${wrong_version}'; validate_artifact_bundle")" \
  'an OS version mismatch is rejected'

wrong_arch="${FIXTURE_ROOT}/wrong-arch"
make_fixture_bundle "${wrong_arch}" "${host_os}" "${host_version}" 'sparc64'
assert_eq '1' \
  "$(installer_status "parse_installer_args --artifacts '${wrong_arch}'; validate_artifact_bundle")" \
  'an architecture mismatch is rejected'

assert_eq 'amd64' "$(installer_eval 'normalize_arch x86_64')" 'x86_64 normalizes to amd64'
assert_eq 'arm64' "$(installer_eval 'normalize_arch aarch64')" 'aarch64 normalizes to arm64'

# The manifest must be read as data. Proving it is never sourced: a manifest
# holding shell syntax must not execute it.
hostile="${FIXTURE_ROOT}/hostile-manifest"
make_fixture_bundle "${hostile}"
printf 'EVIL=$(touch %s/pwned)\n' "${FIXTURE_ROOT}" >> "${hostile}/manifest"
(cd "${hostile}" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
installer_eval "parse_installer_args --artifacts '${hostile}'; validate_artifact_bundle" > /dev/null 2>&1
if [[ -e "${FIXTURE_ROOT}/pwned" ]]; then
  fail 'manifest is parsed as data, never sourced' 'manifest contents were executed'
else
  pass 'manifest is parsed as data, never sourced'
fi

echo ''
echo '# Local APT repository isolation'

apt_body="$(extract_function install_packages_from_artifacts "${INSTALLER}")"

for opt in \
  'Dir::Etc::sourcelist=' \
  'Dir::Etc::sourceparts=-' \
  'APT::Get::List-Cleanup=0' \
  'Acquire::Retries=0'
do
  assert_contains "${apt_body}" "${opt}" "artifact APT invocation sets ${opt}"
done

assert_contains "${apt_body}" 'deb [trusted=yes] file:' \
  'artifact APT source points at a local file: repository'

apt_invocations="$(echo "${apt_body}" | grep -c 'apt-get' || true)"
isolated_invocations="$(echo "${apt_body}" | grep 'apt-get' | grep -c '"${apt_opts\[@\]}"' || true)"
assert_eq "${apt_invocations}" "${isolated_invocations}" \
  'every apt-get invocation in artifact mode uses the isolation options'

echo ''
echo '# Fail-closed: no network acquisition in artifact code paths'

artifact_functions=(
  validate_artifact_bundle
  install_packages_from_artifacts
  setup_nvidia_container_toolkit_from_artifacts
  copy_artifact_payload_file
  copy_helper_scripts_from_artifacts
  copy_management_compose_file_from_artifacts
  load_artifact_images
  seed_artifact_content
  start_management_containers
)

for fn in "${artifact_functions[@]}"; do
  body="$(extract_function "${fn}" "${INSTALLER}")"
  if [[ -z "${body}" ]]; then
    fail "${fn} exists in the installer" 'function not found'
    continue
  fi
  # Comments may legitimately describe the online path, so only executable
  # lines are scanned.
  offenders="$(echo "${body}" | grep -v '^[[:space:]]*#' \
    | grep -nE 'https?://|\bwget\b|curl[[:space:]]+-|docker[[:space:]]+(compose[[:space:]]+)?pull|get\.docker\.com' || true)"
  if [[ -z "${offenders}" ]]; then
    pass "${fn} performs no network acquisition"
  else
    fail "${fn} performs no network acquisition" "${offenders}"
  fi
done

echo ''
echo '# Compose startup behaviour'

# Intercept the privileged call so the compose command line can be inspected.
compose_stub='sudo() { echo "SUDO $*"; }; NOMAD_DIR=/opt/project-nomad'

artifact_start="$(installer_eval "${compose_stub}; parse_installer_args --artifacts '${VALID_BUNDLE}'; start_management_containers" 2>&1)"
assert_contains "${artifact_start}" '--pull never' 'artifact startup passes --pull never'
assert_contains "${artifact_start}" '-f /opt/project-nomad/compose.artifact.yml' \
  'artifact startup layers the generated compose override'
assert_not_contains "${artifact_start}" 'docker compose pull' 'artifact startup never pulls'

online_start="$(installer_eval "${compose_stub}; start_management_containers" 2>&1)"
assert_not_contains "${online_start}" '--pull never' 'online startup is unchanged (no --pull never)'
assert_not_contains "${online_start}" 'compose.artifact.yml' 'online startup does not reference the override'
assert_contains "${online_start}" 'SUDO docker compose -p project-nomad -f /opt/project-nomad/compose.yml up -d' \
  'online startup keeps its original compose command'

echo ''
echo '# Acquisition dispatch'

dispatch_stub='download_helper_scripts() { echo ONLINE_HELPERS; }; copy_helper_scripts_from_artifacts() { echo ARTIFACT_HELPERS; }; download_management_compose_file() { echo ONLINE_COMPOSE; }; copy_management_compose_file_from_artifacts() { echo ARTIFACT_COMPOSE; }; configure_management_compose_file() { echo CONFIGURED; }'

assert_eq 'ONLINE_HELPERS' \
  "$(installer_eval "${dispatch_stub}; setup_helper_scripts")" \
  'helper scripts are downloaded in online mode'

assert_eq 'ARTIFACT_HELPERS' \
  "$(installer_eval "${dispatch_stub}; parse_installer_args --artifacts '${VALID_BUNDLE}'; setup_helper_scripts")" \
  'helper scripts are copied from the bundle in artifact mode'

assert_eq 'ONLINE_COMPOSE
CONFIGURED' \
  "$(installer_eval "${dispatch_stub}; setup_management_compose_file")" \
  'online compose acquisition still runs the shared configuration step'

assert_eq 'ARTIFACT_COMPOSE
CONFIGURED' \
  "$(installer_eval "${dispatch_stub}; parse_installer_args --artifacts '${VALID_BUNDLE}'; setup_management_compose_file")" \
  'artifact compose acquisition runs the same shared configuration step'

echo ''
echo '# Host without a LAN address'

no_ip_stub='hostname() { :; }'

assert_eq 'localhost' \
  "$(installer_eval "${no_ip_stub}; parse_installer_args --artifacts '${VALID_BUNDLE}'; get_local_ip > /dev/null; echo \"\${local_ip_address}\"")" \
  'artifact mode falls back to localhost when there is no LAN address'

assert_eq 'false' \
  "$(installer_eval "${no_ip_stub}; parse_installer_args --artifacts '${VALID_BUNDLE}'; get_local_ip > /dev/null; echo \"\${has_lan_address}\"")" \
  'no LAN address is recorded when none exists'

assert_eq '1' "$(installer_status "${no_ip_stub}; get_local_ip")" \
  'online mode still fails when no LAN address can be determined'

assert_eq 'true' \
  "$(installer_eval 'hostname() { echo "192.168.1.50 10.0.0.1"; }; get_local_ip > /dev/null; echo "${local_ip_address} ${has_lan_address}"' | awk '{print $2}')" \
  'a real LAN address is still detected normally'

success_no_lan="$(installer_eval "${no_ip_stub}; parse_installer_args --artifacts '${VALID_BUNDLE}'; get_local_ip > /dev/null; success_message")"
assert_not_contains "${success_no_lan}" ' or http://' \
  'no LAN URL is advertised when the host has no LAN address'

success_with_lan="$(installer_eval 'hostname() { echo 192.168.1.50; }; get_local_ip > /dev/null; success_message')"
assert_contains "${success_with_lan}" 'http://192.168.1.50:8080' \
  'the LAN URL is still advertised when a LAN address exists'

echo ''
echo '# Bundle builder'

builder_eval() {
  NOMAD_BUNDLE_LIB_ONLY='1' bash -c "source '${BUILDER}'; $1"
}

override_out="${FIXTURE_ROOT}/override.yml"
builder_eval "write_pull_never_override '${override_out}' admin mysql redis" > /dev/null 2>&1
override_content="$(cat "${override_out}" 2>/dev/null || true)"
assert_contains "${override_content}" 'pull_policy: never' 'builder writes pull_policy: never'
for service in admin mysql redis; do
  assert_contains "${override_content}" "  ${service}:" "builder override includes service ${service}"
done

builder_eval "write_pull_never_override '${FIXTURE_ROOT}/empty.yml'" > /dev/null 2>&1
assert_eq '1' "$?" 'builder refuses to write an override with no services'

# Every service in the canonical compose file must end up in the override, or
# that service would still contact a registry on the target.
mapfile -t all_services < <(compose_services "${COMPOSE_FILE}")
if [[ ${#all_services[@]} -eq 0 ]]; then
  fail 'management compose services were discovered' 'no services parsed'
else
  pass "management compose services were discovered (${#all_services[@]})"
  full_override="${FIXTURE_ROOT}/full-override.yml"
  builder_eval "write_pull_never_override '${full_override}' ${all_services[*]}" > /dev/null 2>&1
  override_service_count="$(grep -c 'pull_policy: never' "${full_override}" || true)"
  assert_eq "${#all_services[@]}" "${override_service_count}" \
    'generated override covers every management service'
  for service in "${all_services[@]}"; do
    assert_contains "$(cat "${full_override}")" "  ${service}:" \
      "generated override covers ${service}"
  done
fi

# The builder's package set must stay in step with the installer's, or the
# bundle will be missing something artifact mode then tries to install.
builder_packages="$(awk '/^ARTIFACT_PACKAGES=\(/{p=1;next} p&&/^\)/{exit} p{gsub(/[[:space:]]/,"");print}' "${BUILDER}")"
installer_packages="$(echo "${apt_body}" | awk '/local packages=\(/{p=1;next} p&&/^[[:space:]]*\)/{exit} p{gsub(/[[:space:]]/,"");print}')"
assert_eq "${builder_packages}" "${installer_packages}" \
  'builder and installer agree on the host package list'

# Docker must be acquired from the bundle, never from the network, or an
# offline target has no container runtime at all.
for docker_package in docker-ce docker-ce-cli containerd.io docker-compose-plugin; do
  assert_contains "${builder_packages}" "${docker_package}" \
    "bundle includes ${docker_package} for offline Docker installation"
done

echo ''
echo '# Re-running over an existing install (offline update)'

existing_dir="${FIXTURE_ROOT}/existing-install"
mkdir -p "${existing_dir}"
cat > "${existing_dir}/compose.yml" <<'EOF'
services:
  admin:
    environment:
      - APP_KEY=EXISTINGAPPKEY123456
      - URL=http://192.168.1.77:8080
      - DB_PASSWORD=EXISTINGDBPASS
  mysql:
    environment:
      - MYSQL_ROOT_PASSWORD=EXISTINGROOTPASS
      - MYSQL_PASSWORD=EXISTINGDBPASS
EOF

detect_snippet="NOMAD_DIR='${existing_dir}'; parse_installer_args --artifacts '${VALID_BUNDLE}'; detect_existing_installation"

assert_eq 'true' \
  "$(installer_eval "${detect_snippet}; echo \"\${existing_install}\"")" \
  'an existing installation is detected from its compose file'

assert_eq 'EXISTINGAPPKEY123456' \
  "$(installer_eval "${detect_snippet}; echo \"\${existing_app_key}\"")" \
  'the existing APP_KEY is recovered'

assert_eq 'EXISTINGDBPASS' \
  "$(installer_eval "${detect_snippet}; echo \"\${existing_db_password}\"")" \
  'the existing database password is recovered'

assert_eq 'EXISTINGROOTPASS' \
  "$(installer_eval "${detect_snippet}; echo \"\${existing_db_root_password}\"")" \
  'the existing database root password is recovered'

assert_eq 'http://192.168.1.77:8080' \
  "$(installer_eval "${detect_snippet}; echo \"\${existing_url}\"")" \
  'the existing access URL is recovered'

# A fresh install must not be mistaken for an update.
fresh_dir="${FIXTURE_ROOT}/fresh-install"
mkdir -p "${fresh_dir}"
assert_eq 'false' \
  "$(installer_eval "NOMAD_DIR='${fresh_dir}'; parse_installer_args --artifacts '${VALID_BUNDLE}'; detect_existing_installation; echo \"\${existing_install}\"")" \
  'a directory with no compose file is treated as a fresh install'

placeholder_dir="${FIXTURE_ROOT}/placeholder-install"
mkdir -p "${placeholder_dir}"
printf 'services:\n  admin:\n    environment:\n      - APP_KEY=replaceme\n' > "${placeholder_dir}/compose.yml"
assert_eq 'false' \
  "$(installer_eval "NOMAD_DIR='${placeholder_dir}'; parse_installer_args --artifacts '${VALID_BUNDLE}'; detect_existing_installation; echo \"\${existing_install}\"")" \
  'an unconfigured compose file is not treated as an existing install'

# The critical guarantee: updating must not wipe the database directory.
update_dir="${FIXTURE_ROOT}/update-preserves"
mkdir -p "${update_dir}/mysql"
cp "${existing_dir}/compose.yml" "${update_dir}/compose.yml"
echo 'user data' > "${update_dir}/mysql/ibdata1"
installer_eval "NOMAD_DIR='${update_dir}'; parse_installer_args --artifacts '${VALID_BUNDLE}'; sudo() { :; }; detect_existing_installation; configure_management_compose_file" > /dev/null 2>&1
if [[ -f "${update_dir}/mysql/ibdata1" ]]; then
  pass 'updating an existing install does not delete the MySQL data directory'
else
  fail 'updating an existing install does not delete the MySQL data directory' 'data directory was removed'
fi

updated_compose="$(cat "${update_dir}/compose.yml")"
assert_contains "${updated_compose}" 'APP_KEY=EXISTINGAPPKEY123456' \
  'the existing APP_KEY is carried into the updated compose file'
assert_contains "${updated_compose}" 'MYSQL_PASSWORD=EXISTINGDBPASS' \
  'the existing database password is carried into the updated compose file'

# Online mode keeps its original behaviour, including the deliberate wipe.
online_dir="${FIXTURE_ROOT}/online-install"
mkdir -p "${online_dir}/mysql"
cp "${existing_dir}/compose.yml" "${online_dir}/compose.yml"
online_configure="$(installer_eval "NOMAD_DIR='${online_dir}'; detect_existing_installation; configure_management_compose_file" 2>&1)"
assert_contains "${online_configure}" 'Removing existing MySQL data directory' \
  'online mode still resets the database directory as before'

echo ''
echo '# Removable media metadata (FAT/exFAT AppleDouble sidecars)'

# A bundle carried on FAT/exFAT collects "._name" sidecars from macOS. They must
# never be treated as bundle content, or checksums fail and ._core-images.tar
# gets fed to docker load.
appledouble_bundle="${FIXTURE_ROOT}/appledouble"
make_fixture_bundle "${appledouble_bundle}"
printf 'mac metadata\n' > "${appledouble_bundle}/images/._core-images.tar"
printf 'mac metadata\n' > "${appledouble_bundle}/._install_nomad.sh"
printf 'mac metadata\n' > "${appledouble_bundle}/packages/apt/._docker-ce.deb"
assert_eq '0' \
  "$(installer_status "parse_installer_args --artifacts '${appledouble_bundle}'; validate_artifact_bundle")" \
  'a bundle still validates when the OS adds AppleDouble sidecars'

assert_contains "$(extract_function load_artifact_images "${INSTALLER}")" '._*' \
  'image loading skips AppleDouble sidecars that match *.tar'

checksum_body="$(extract_function write_checksums "${BUILDER}")"
assert_contains "${checksum_body}" "! -name '._*'" \
  'checksum generation excludes AppleDouble sidecars'
assert_contains "${checksum_body}" "-name '.DS_Store'" \
  'checksum generation excludes .DS_Store'

echo ''
echo '# Docker-only build entry point'

DOCKER_WRAPPER="${INSTALL_DIR}/build_offline_bundle_docker.sh"

if [[ -f "${DOCKER_WRAPPER}" ]]; then
  pass 'the Docker build entry point exists'
  wrapper_src="$(cat "${DOCKER_WRAPPER}")"

  assert_contains "${wrapper_src}" '${DOCKER_SOCKET}:/var/run/docker.sock' \
    'wrapper mounts the Docker socket so nested builds reach the host daemon'
  # The invariant is that a path means the same thing to the build container and
  # to the host daemon, since the build starts further containers whose bind
  # mounts the daemon resolves. On Linux that is literally the same string; on
  # Docker Desktop the container side becomes /run/desktop/mnt/host/<drive>/…,
  # which the daemon resolves to the same directory. Assert the behaviour of the
  # two helpers rather than a fixed mount line, so the Windows support does not
  # have to look like the Linux case to be correct.
  assert_contains "${wrapper_src}" 'host_mount_source "${path}"):$(daemon_identity_path "${path}")' \
    'wrapper builds mounts from the daemon-source and container-path helpers'

  wrapper_helpers="$(sed -n '/^host_mount_source() {/,/^}/p;/^daemon_identity_path() {/,/^}/p' "${DOCKER_WRAPPER}")"
  identity_probe="$(HOST_IS_WINDOWS='0' bash -c "
    ${wrapper_helpers}
    printf '%s|%s' \"\$(host_mount_source /srv/nomad)\" \"\$(daemon_identity_path /srv/nomad)\"
  ")"
  assert_eq "${identity_probe}" '/srv/nomad|/srv/nomad' \
    'wrapper mounts host paths at identical locations inside the container'
  assert_contains "${wrapper_src}" 'exec bash install/build_offline_bundle.sh "$@"' \
    'wrapper delegates to the real builder with arguments passed through'

  # The whole point is that the host needs nothing but Docker, so the wrapper
  # must not depend on host tooling the builder needs.
  wrapper_code="$(echo "${wrapper_src}" | grep -v '^[[:space:]]*#')"
  for host_tool in sha256sum dpkg-scanpackages; do
    assert_not_contains "${wrapper_code}" "${host_tool}" \
      "wrapper does not require ${host_tool} on the host"
  done

  # Options that name a path must be resolved and mounted, or the nested
  # containers cannot see them.
  for path_option in '--output' '--repo' '--content-dir' '--extra-image-archive' '--extra-image-list'; do
    assert_contains "${wrapper_code}" "${path_option}" \
      "wrapper resolves and mounts ${path_option}"
  done

  wrapper_eval() {
    NOMAD_BUILDER_LIB_ONLY='1' bash -c "source '${DOCKER_WRAPPER}'; $1"
  }

  # Output location selection. The menu offers the current location first, then
  # connected removable drives, then home.
  assert_eq "${PWD}/dist" \
    "$(printf '1\n' | wrapper_eval 'OUTPUT_CHOICE=""; prompt_for_output_dir >/dev/null 2>&1; echo "${OUTPUT_CHOICE}"')" \
    'choosing 1 writes the bundle where the build is running from'

  assert_eq "${PWD}/dist" \
    "$(printf '\n' | wrapper_eval 'OUTPUT_CHOICE=""; prompt_for_output_dir >/dev/null 2>&1; echo "${OUTPUT_CHOICE}"')" \
    'pressing enter accepts the default location'

  assert_eq '/tmp/nomad-custom-target' \
    "$(printf 'c\n/tmp/nomad-custom-target\n' | wrapper_eval 'OUTPUT_CHOICE=""; prompt_for_output_dir >/dev/null 2>&1; echo "${OUTPUT_CHOICE}"')" \
    'a custom path can be entered'

  assert_eq "${PWD}/dist" \
    "$(printf '99\nnonsense\n1\n' | wrapper_eval 'OUTPUT_CHOICE=""; prompt_for_output_dir >/dev/null 2>&1; echo "${OUTPUT_CHOICE}"')" \
    'invalid input re-prompts rather than picking something arbitrary'

  menu_output="$(printf '1\n' | wrapper_eval 'prompt_for_output_dir 2>&1' || true)"
  assert_contains "${menu_output}" 'enter a custom path' 'the menu offers a custom path'
  assert_contains "${menu_output}" '[default]' 'the menu marks a default choice'

  # Unattended runs must never block on stdin.
  assert_eq "${PWD}/dist" \
    "$(printf '' | wrapper_eval 'OUTPUT_CHOICE=""; choose_output_dir >/dev/null 2>&1; echo "${OUTPUT_CHOICE}"')" \
    'a non-interactive stdin uses the default without prompting'

  assert_eq "${PWD}/dist" \
    "$(NOMAD_NO_PROMPT=1 wrapper_eval 'OUTPUT_CHOICE=""; choose_output_dir >/dev/null 2>&1; echo "${OUTPUT_CHOICE}"' < /dev/null)" \
    'NOMAD_NO_PROMPT skips the prompt'

  assert_contains "${wrapper_code}" '--no-prompt' 'wrapper accepts --no-prompt'
  assert_contains "${wrapper_code}" '! -t 0' 'wrapper treats a non-TTY as non-interactive'
else
  fail 'the Docker build entry point exists' "${DOCKER_WRAPPER} not found"
fi

echo ''
echo '# Online installation path is untouched'

for fn in ensure_dependencies_installed ensure_docker_installed download_helper_scripts download_management_compose_file setup_nvidia_container_toolkit; do
  if [[ -n "$(extract_function "${fn}" "${INSTALLER}")" ]]; then
    pass "online function ${fn} is still present"
  else
    fail "online function ${fn} is still present" 'function not found'
  fi
done

assert_contains "$(extract_function download_management_compose_file "${INSTALLER}")" \
  'curl -fsSL "$MANAGEMENT_COMPOSE_FILE_URL"' \
  'online compose download still uses the original curl call'

assert_contains "$(extract_function ensure_docker_installed "${INSTALLER}")" \
  'https://get.docker.com' \
  'online Docker installation still uses the convenience script'

###################################################################################################################################################################################################

echo ''
echo "-------------------------------------------------"
echo "  passed: ${pass_count}   failed: ${fail_count}"
echo "-------------------------------------------------"

[[ "${fail_count}" -eq 0 ]] || exit 1
