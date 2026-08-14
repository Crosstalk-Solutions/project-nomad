#!/bin/bash

# Project NOMAD Installation Script

###################################################################################################################################################################################################

# Script                | Project NOMAD Installation Script
# Version               | 1.0.0
# Author                | Crosstalk Solutions, LLC
# Website               | https://crosstalksolutions.com

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Color Codes                                                                                           #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

RESET='\033[0m'
YELLOW='\033[1;33m'
WHITE_R='\033[39m' # Same as GRAY_R for terminals with white background.
GRAY_R='\033[39m'
RED='\033[1;31m' # Light Red.
GREEN='\033[1;32m' # Light Green.

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                  Constants & Variables                                                                                          #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

WHIPTAIL_TITLE="Project NOMAD Installation"
NOMAD_DIR="/opt/project-nomad"
MANAGEMENT_COMPOSE_FILE_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/management_compose.yaml"
START_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/start_nomad.sh"
STOP_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/stop_nomad.sh"
UPDATE_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/update_nomad.sh"
script_option_debug='true'
accepted_terms='false'
local_ip_address=''
has_lan_address='false'

# Offline artifact mode. When an artifact bundle is selected (--artifacts or
# NOMAD_ARTIFACT_PATH) every dependency — host packages, Docker images, helper
# scripts and the management compose file — is taken from that bundle, and the
# installer never falls back to the network. See admin/docs/offline-install.md.
SUPPORTED_BUNDLE_FORMAT_VERSION='1'
NOMAD_ARTIFACT_PATH="${NOMAD_ARTIFACT_PATH:-}"
artifact_mode='false'
existing_install='false'
existing_app_key=''
existing_db_password=''
existing_db_root_password=''
existing_url=''
artifact_manifest_file=''
artifact_apt_repo_dir=''
artifact_image_dir=''
artifact_payload_dir=''

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Functions                                                                                             #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

usage() {
  cat <<EOF
Project NOMAD Installation Script

Usage:
  sudo bash $(basename "$0") [options]

Options:
  --artifacts PATH   Install from a local offline artifact bundle instead of
                     downloading dependencies from the internet. Bundles are
                     produced on a connected machine by
                     install/build_offline_bundle.sh and are specific to one
                     OS / version / architecture.
  -h, --help         Show this help text and exit.

Environment:
  NOMAD_ARTIFACT_PATH   Equivalent to --artifacts. The command line option wins
                        when both are supplied.

With no artifact path the installer behaves exactly as before and downloads its
dependencies from the internet.
EOF
}

parse_installer_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --artifacts)
        if [[ $# -lt 2 || -z "$2" ]]; then
          echo -e "${RED}#${RESET} --artifacts requires the path to an offline artifact bundle."
          exit 1
        fi
        NOMAD_ARTIFACT_PATH="$2"
        shift
        ;;
      --artifacts=*)
        NOMAD_ARTIFACT_PATH="${1#*=}"
        if [[ -z "${NOMAD_ARTIFACT_PATH}" ]]; then
          echo -e "${RED}#${RESET} --artifacts requires the path to an offline artifact bundle."
          exit 1
        fi
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo -e "${RED}#${RESET} Unknown option: $1"
        usage
        exit 1
        ;;
    esac
    shift
  done

  if [[ -n "${NOMAD_ARTIFACT_PATH}" ]]; then
    local resolved_path
    if ! resolved_path="$(cd -- "${NOMAD_ARTIFACT_PATH}" 2>/dev/null && pwd)"; then
      echo -e "${RED}#${RESET} Offline artifact bundle directory not found: ${NOMAD_ARTIFACT_PATH}"
      exit 1
    fi
    NOMAD_ARTIFACT_PATH="${resolved_path}"
    artifact_mode='true'
    artifact_manifest_file="${NOMAD_ARTIFACT_PATH}/manifest"
    artifact_apt_repo_dir="${NOMAD_ARTIFACT_PATH}/packages/apt"
    artifact_image_dir="${NOMAD_ARTIFACT_PATH}/images"
    artifact_payload_dir="${NOMAD_ARTIFACT_PATH}/payload/nomad"
  fi
}

artifact_mode_enabled() {
  [[ "${artifact_mode}" == 'true' ]]
}

artifact_manifest_get() {
  # The manifest is data, not shell. Read individual keys instead of sourcing it
  # so a malformed or hostile bundle cannot execute code on the target.
  local key="$1"
  awk -F= -v wanted="${key}" '$1 == wanted { sub(/^[^=]*=/, "", $0); print; exit }' "${artifact_manifest_file}"
}

normalize_arch() {
  case "$1" in
    x86_64|amd64) echo 'amd64' ;;
    aarch64|arm64) echo 'arm64' ;;
    *) echo "$1" ;;
  esac
}

os_release_get() {
  local key="$1"
  [[ -r /etc/os-release ]] || return 0
  awk -F= -v wanted="${key}" '$1 == wanted { gsub(/^"|"$/, "", $2); print $2; exit }' /etc/os-release
}

validate_artifact_bundle() {
  echo -e "${YELLOW}#${RESET} Offline artifact mode selected: ${NOMAD_ARTIFACT_PATH}\\n"

  if ! command -v sha256sum &> /dev/null; then
    header_red
    echo -e "${RED}#${RESET} sha256sum is required to verify an offline artifact bundle but was not found."
    exit 1
  fi

  # Distinguish "not a bundle at all" from "a damaged bundle". Pointing
  # --artifacts at a source checkout instead of a built bundle is an easy
  # mistake to make, and deserves a better answer than a missing-file list.
  if [[ ! -f "${artifact_manifest_file}" ]]; then
    header_red
    echo -e "${RED}#${RESET} ${NOMAD_ARTIFACT_PATH} is not an offline artifact bundle (it has no 'manifest' file).\\n"
    echo -e "${RED}#${RESET} --artifacts must point at a bundle directory, not at a Project NOMAD source"
    echo -e "${RED}#${RESET} checkout. Bundles are named project-nomad-offline-<os>-<version>-<arch>-<commit>"
    echo -e "${RED}#${RESET} and contain a manifest, SHA256SUMS, packages/, images/ and payload/.\\n"
    echo -e "${RED}#${RESET} Build one on an internet-connected machine:"
    echo -e "${RED}#${RESET}   ./install/build_offline_bundle.sh --target ubuntu:26.04 --output <output-dir>\\n"
    echo -e "${RED}#${RESET} Then copy the resulting directory to this machine, cd into it, and run:"
    echo -e "${RED}#${RESET}   sudo bash ./install_nomad.sh --artifacts ."
    exit 1
  fi

  # Every one of these is required for a complete offline install. A bundle that
  # is missing any of them must fail here rather than part-way through, because
  # artifact mode has no network fallback to fill the gap.
  local required_files=(
    "${NOMAD_ARTIFACT_PATH}/SHA256SUMS"
    "${artifact_apt_repo_dir}/Packages"
    "${artifact_apt_repo_dir}/Packages.gz"
    "${artifact_image_dir}/core-images.txt"
    "${artifact_image_dir}/core-images.tar"
    "${artifact_payload_dir}/management_compose.yaml"
    "${artifact_payload_dir}/compose.artifact.yml"
    "${artifact_payload_dir}/start_nomad.sh"
    "${artifact_payload_dir}/stop_nomad.sh"
    "${artifact_payload_dir}/update_nomad.sh"
  )
  local required_file
  for required_file in "${required_files[@]}"; do
    if [[ ! -f "${required_file}" ]]; then
      header_red
      echo -e "${RED}#${RESET} The offline artifact bundle is incomplete. Missing: ${required_file}"
      echo -e "${RED}#${RESET} Rebuild the bundle with install/build_offline_bundle.sh on a connected machine and try again."
      exit 1
    fi
  done

  # Transfer integrity only. These checksums prove the bundle arrived intact;
  # they are not a publisher signature and do not prove who produced it.
  echo -e "${YELLOW}#${RESET} Verifying artifact bundle checksums...\\n"
  if ! (cd "${NOMAD_ARTIFACT_PATH}" && sha256sum -c SHA256SUMS > /dev/null); then
    header_red
    echo -e "${RED}#${RESET} The offline artifact bundle failed checksum verification."
    echo -e "${RED}#${RESET} It is corrupt or incomplete — copy it again from the build machine and retry."
    exit 1
  fi

  local bundle_format target_os target_version target_arch
  bundle_format="$(artifact_manifest_get BUNDLE_FORMAT_VERSION)"
  target_os="$(artifact_manifest_get TARGET_OS)"
  target_version="$(artifact_manifest_get TARGET_VERSION)"
  target_arch="$(artifact_manifest_get TARGET_ARCH)"

  if [[ "${bundle_format}" != "${SUPPORTED_BUNDLE_FORMAT_VERSION}" ]]; then
    header_red
    echo -e "${RED}#${RESET} Unsupported artifact bundle format '${bundle_format:-unknown}'."
    echo -e "${RED}#${RESET} This installer supports bundle format ${SUPPORTED_BUNDLE_FORMAT_VERSION}."
    exit 1
  fi

  if [[ -z "${target_os}" || -z "${target_version}" || -z "${target_arch}" ]]; then
    header_red
    echo -e "${RED}#${RESET} The artifact manifest is incomplete — TARGET_OS, TARGET_VERSION and TARGET_ARCH are all required."
    exit 1
  fi

  # Bundles carry a dependency closure resolved for one exact distribution and
  # architecture, so a mismatch is an error rather than a warning.
  local host_os host_version host_arch
  host_os="$(os_release_get ID)"
  host_version="$(os_release_get VERSION_ID)"
  host_arch="$(normalize_arch "$(dpkg --print-architecture 2>/dev/null || uname -m)")"

  if [[ "${host_os}" != "${target_os}" ]]; then
    header_red
    echo -e "${RED}#${RESET} This bundle targets ${target_os}, but this host is ${host_os:-unknown}."
    echo -e "${RED}#${RESET} Build a bundle for ${host_os:-this host} and try again."
    exit 1
  fi
  if [[ "${host_version}" != "${target_version}" ]]; then
    header_red
    echo -e "${RED}#${RESET} This bundle targets ${target_os} ${target_version}, but this host runs ${host_version:-unknown}."
    echo -e "${RED}#${RESET} Bundles are specific to one OS version because they carry a resolved package set."
    exit 1
  fi
  if [[ "${host_arch}" != "${target_arch}" ]]; then
    header_red
    echo -e "${RED}#${RESET} This bundle targets ${target_arch}, but this host is ${host_arch:-unknown}."
    exit 1
  fi

  echo -e "${GREEN}#${RESET} Artifact bundle validated (NOMAD commit $(artifact_manifest_get NOMAD_COMMIT), built $(artifact_manifest_get CREATED_AT_UTC)).\\n"
}

header() {
  if [[ "${script_option_debug}" != 'true' ]]; then clear; clear; fi
  echo -e "${GREEN}#########################################################################${RESET}\\n"
}

header_red() {
  if [[ "${script_option_debug}" != 'true' ]]; then clear; clear; fi
  echo -e "${RED}#########################################################################${RESET}\\n"
}

check_has_sudo() {
  if sudo -n true 2>/dev/null; then
    echo -e "${GREEN}#${RESET} User has sudo permissions.\\n"
  else
    echo "User does not have sudo permissions"
    header_red
    echo -e "${RED}#${RESET} This script requires sudo permissions to run. Please run the script with sudo.\\n"
    echo -e "${RED}#${RESET} For example: sudo bash $(basename "$0")"
    exit 1
  fi
}

check_is_bash() {
  if [[ -z "$BASH_VERSION" ]]; then
    header_red
    echo -e "${RED}#${RESET} This script requires bash to run. Please run the script using bash.\\n"
    echo -e "${RED}#${RESET} For example: bash $(basename "$0")"
    exit 1
  fi
    echo -e "${GREEN}#${RESET} This script is running in bash.\\n"
}

check_is_debian_based() {
  if [[ ! -f /etc/debian_version ]]; then
    header_red
    echo -e "${RED}#${RESET} This script is designed to run on Debian-based systems only.\\n"
    echo -e "${RED}#${RESET} Please run this script on a Debian-based system and try again."
    exit 1
  fi
    echo -e "${GREEN}#${RESET} This script is running on a Debian-based system.\\n"
}

check_is_x86_64() {
  local arch
  arch="$(uname -m)"
  if [[ "${arch}" != "x86_64" && "${arch}" != "amd64" ]]; then
    echo -e "${YELLOW}#${RESET} WARNING: Detected architecture '${arch}'. NOMAD officially supports x86_64 only.\\n"
    echo -e "${YELLOW}#${RESET} ARM64/aarch64 support is tracked in PR #419 and is not yet ready.\\n"
    echo -e "${YELLOW}#${RESET} Continuing on an unsupported architecture will likely fail and may leave\\n"
    echo -e "${YELLOW}#${RESET} partial Docker images and files behind that you'll need to clean up manually.\\n"
    echo -e "${YELLOW}#${RESET} Continuing in 10 seconds... press Ctrl+C now to abort.\\n"
    sleep 10
    return
  fi
  echo -e "${GREEN}#${RESET} Architecture check passed (${arch}).\\n"
}

ensure_dependencies_installed() {
  local missing_deps=()

  # Check for curl
  if ! command -v curl &> /dev/null; then
    missing_deps+=("curl")
  fi

  # Check for gpg (required for NVIDIA container toolkit keyring)
  if ! command -v gpg &> /dev/null; then
    missing_deps+=("gpg")
  fi

  # Check for whiptail (used for dialogs, though not currently active)
  # if ! command -v whiptail &> /dev/null; then
  #   missing_deps+=("whiptail")
  # fi

  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    echo -e "${YELLOW}#${RESET} Installing required dependencies: ${missing_deps[*]}...\\n"
    sudo apt-get update
    sudo apt-get install -y "${missing_deps[@]}"

    # Verify installation
    for dep in "${missing_deps[@]}"; do
      if ! command -v "$dep" &> /dev/null; then
        echo -e "${RED}#${RESET} Failed to install $dep. Please install it manually and try again."
        exit 1
      fi
    done
    echo -e "${GREEN}#${RESET} Dependencies installed successfully.\\n"
  else
    echo -e "${GREEN}#${RESET} All required dependencies are already installed.\\n"
  fi
}

check_is_debug_mode(){
  # Check if the script is being run in debug mode
  if [[ "${script_option_debug}" == 'true' ]]; then
    echo -e "${YELLOW}#${RESET} Debug mode is enabled, the script will not clear the screen...\\n"
  else
    clear; clear
  fi
}

generateRandomPass() {
  local length="${1:-32}"  # Default to 32
  local password
  
  # Generate random password using /dev/urandom
  password=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$length")
  
  echo "$password"
}

ensure_docker_installed() {
  if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}#${RESET} Docker not found. Installing Docker...\\n"
    
    # Update package database
    sudo apt-get update
    
    # Install prerequisites
    sudo apt-get install -y ca-certificates curl
    
    # Create directory for keyrings
    # sudo install -m 0755 -d /etc/apt/keyrings
    
    # # Download Docker's official GPG key
    # sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    # sudo chmod a+r /etc/apt/keyrings/docker.asc

    # # Add the repository to Apt sources
    # echo \
    #   "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
    #   $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    #   sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    # # Update the package database with the Docker packages from the newly added repo
    # sudo apt-get update

    # # Install Docker packages
    # sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Download the Docker convenience script
    curl -fsSL https://get.docker.com -o get-docker.sh

    # Run the Docker installation script
    sudo sh get-docker.sh

    # Check if Docker was installed successfully
    if ! command -v docker &> /dev/null; then
      echo -e "${RED}#${RESET} Docker installation failed. Please check the logs and try again."
      exit 1
    fi
    
    echo -e "${GREEN}#${RESET} Docker installation completed.\\n"
  else
    echo -e "${GREEN}#${RESET} Docker is already installed.\\n"
    
    # Check if Docker service is running
    if ! systemctl is-active --quiet docker; then
      echo -e "${YELLOW}#${RESET} Docker is installed but not running. Attempting to start Docker...\\n"
      sudo systemctl start docker
      if ! systemctl is-active --quiet docker; then
        echo -e "${RED}#${RESET} Failed to start Docker. Please check the Docker service status and try again."
        exit 1
      else
        echo -e "${GREEN}#${RESET} Docker service started successfully.\\n"
      fi
    else
      echo -e "${GREEN}#${RESET} Docker service is already running.\\n"
    fi
  fi
}

install_packages_from_artifacts() {
  # Artifact-mode replacement for ensure_dependencies_installed + ensure_docker_installed.
  # Everything comes from the bundle's flat APT repository; the host's configured
  # remote repositories take no part in dependency resolution.
  echo -e "${YELLOW}#${RESET} Installing host dependencies from the offline artifact bundle...\\n"

  local apt_root
  if ! apt_root="$(mktemp -d /tmp/nomad-artifact-apt.XXXXXX)"; then
    header_red
    echo -e "${RED}#${RESET} Failed to create a temporary directory for the local APT repository."
    exit 1
  fi

  # Removable media is routinely mounted under a path containing spaces, which
  # the APT "file:" source syntax cannot express. Reach the bundle repository
  # through a whitespace-free symlink instead.
  if ! ln -s "${artifact_apt_repo_dir}" "${apt_root}/repo"; then
    header_red
    echo -e "${RED}#${RESET} Failed to link the local APT repository at ${artifact_apt_repo_dir}."
    exit 1
  fi
  mkdir -p "${apt_root}/lists/partial"
  echo "deb [trusted=yes] file:${apt_root}/repo ./" > "${apt_root}/sources.list"

  # Isolation: only the bundle repository is visible (sourcelist), /etc/apt/sources.list.d
  # is excluded (sourceparts=-), list state is kept out of the host's (Dir::State::Lists),
  # and APT is told not to retry fetches. A dependency that is missing from the
  # bundle therefore fails the install instead of being pulled from the internet.
  local apt_opts=(
    -o "Dir::Etc::sourcelist=${apt_root}/sources.list"
    -o "Dir::Etc::sourceparts=-"
    -o "Dir::State::Lists=${apt_root}/lists"
    -o "APT::Get::List-Cleanup=0"
    -o "Acquire::Languages=none"
    -o "Acquire::Retries=0"
  )

  # Mirrors what the online path installs: the dependencies checked by
  # ensure_dependencies_installed, the Docker packages the convenience script
  # would install, and the host utilities used later by verify_gpu_setup.
  local packages=(
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
  if [[ "$(artifact_manifest_get WITH_NVIDIA_TOOLKIT)" == '1' ]]; then
    packages+=(nvidia-container-toolkit)
  fi

  if ! sudo apt-get "${apt_opts[@]}" update; then
    header_red
    echo -e "${RED}#${RESET} Failed to read the offline APT repository at ${artifact_apt_repo_dir}."
    rm -rf "${apt_root}"
    exit 1
  fi

  if ! sudo DEBIAN_FRONTEND=noninteractive apt-get "${apt_opts[@]}" install -y --no-install-recommends "${packages[@]}"; then
    header_red
    echo -e "${RED}#${RESET} Failed to install host dependencies from the offline artifact bundle."
    echo -e "${RED}#${RESET} The bundle is missing one or more packages required by this system. Rebuild it"
    echo -e "${RED}#${RESET} on a connected machine for $(artifact_manifest_get TARGET_OS) $(artifact_manifest_get TARGET_VERSION) and try again."
    rm -rf "${apt_root}"
    exit 1
  fi

  rm -rf "${apt_root}"

  if ! command -v docker &> /dev/null; then
    header_red
    echo -e "${RED}#${RESET} Docker is still not available after installing packages from the bundle."
    exit 1
  fi

  if ! systemctl is-active --quiet docker; then
    echo -e "${YELLOW}#${RESET} Docker is installed but not running. Attempting to start Docker...\\n"
    sudo systemctl enable --now docker
    if ! systemctl is-active --quiet docker; then
      echo -e "${RED}#${RESET} Failed to start Docker. Please check the Docker service status and try again."
      exit 1
    fi
  fi

  echo -e "${GREEN}#${RESET} Host dependencies installed from the offline artifact bundle.\\n"
}

check_docker_compose() {
  # Check if 'docker compose' (v2 plugin) is available
  if ! docker compose version &>/dev/null; then
    echo -e "${RED}#${RESET} Docker Compose v2 is not installed or not available as a Docker plugin."
    echo -e "${YELLOW}#${RESET} This script requires 'docker compose' (v2), not 'docker-compose' (v1)."
    echo -e "${YELLOW}#${RESET} Please read the Docker documentation at https://docs.docker.com/compose/install/ for instructions on how to install Docker Compose v2."
    exit 1
  fi
}

detect_nvidia_gpu() {
  # Shared hardware detection for the online and artifact toolkit paths.
  # Returns 0 when an NVIDIA GPU is present.

  # Safely detect NVIDIA GPU
  local has_nvidia_gpu=false
  if command -v lspci &> /dev/null; then
    if lspci 2>/dev/null | grep -i nvidia &> /dev/null; then
      has_nvidia_gpu=true
      echo -e "${GREEN}#${RESET} NVIDIA GPU detected.\\n"
    fi
  fi

  # Also check for nvidia-smi
  if ! $has_nvidia_gpu && command -v nvidia-smi &> /dev/null; then
    if nvidia-smi &> /dev/null; then
      has_nvidia_gpu=true
      echo -e "${GREEN}#${RESET} NVIDIA GPU detected via nvidia-smi.\\n"
    fi
  fi

  $has_nvidia_gpu
}

setup_nvidia_container_toolkit_from_artifacts() {
  # Artifact-mode counterpart of setup_nvidia_container_toolkit. Same non-blocking
  # philosophy: warn and continue rather than fail the install. The toolkit, when
  # present, was installed from the bundle by install_packages_from_artifacts —
  # the NVIDIA package repository is never contacted.

  echo -e "${YELLOW}#${RESET} Checking for NVIDIA GPU...\\n"

  if ! detect_nvidia_gpu; then
    echo -e "${YELLOW}#${RESET} No NVIDIA GPU detected. Skipping NVIDIA container toolkit configuration.\\n"
    return 0
  fi

  if ! command -v nvidia-ctk &> /dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: an NVIDIA GPU is present but this bundle does not include the NVIDIA"
    echo -e "${YELLOW}#${RESET} Container Toolkit. Rebuild the bundle without --without-nvidia-toolkit to add it.\\n"
    echo -e "${YELLOW}#${RESET} Continuing without NVIDIA container acceleration.\\n"
    return 0
  fi

  if ! command -v nvidia-smi &> /dev/null || ! nvidia-smi &> /dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: the NVIDIA Container Toolkit is installed but no working host NVIDIA"
    echo -e "${YELLOW}#${RESET} driver was detected. Host GPU drivers are outside the scope of offline bundles"
    echo -e "${YELLOW}#${RESET} and must be installed separately. Continuing without GPU acceleration.\\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Configuring Docker to use NVIDIA runtime...\\n"
  if ! sudo nvidia-ctk runtime configure --runtime=docker 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: nvidia-ctk runtime configuration failed. GPU support may require manual setup.\\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Restarting Docker service...\\n"
  if ! sudo systemctl restart docker 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: Failed to restart Docker service. You may need to restart it manually.\\n"
    return 0
  fi

  echo -e "${GREEN}#${RESET} NVIDIA container toolkit configuration completed.\\n"
}

setup_nvidia_container_toolkit() {
  # This function attempts to set up NVIDIA GPU support but is non-blocking
  # Any failures will result in warnings but will NOT stop the installation process

  echo -e "${YELLOW}#${RESET} Checking for NVIDIA GPU...\\n"

  if ! detect_nvidia_gpu; then
    echo -e "${YELLOW}#${RESET} No NVIDIA GPU detected. Skipping NVIDIA container toolkit installation.\\n"
    return 0
  fi

  # Check if nvidia-container-toolkit is already installed
  if command -v nvidia-ctk &> /dev/null; then
    echo -e "${GREEN}#${RESET} NVIDIA container toolkit is already installed.\\n"
    return 0
  fi
  
  echo -e "${YELLOW}#${RESET} Installing NVIDIA container toolkit...\\n"
  
  # Install dependencies per https://docs.ollama.com/docker - wrapped in error handling
  if ! curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey 2>/dev/null | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: Failed to add NVIDIA container toolkit GPG key. Continuing anyway...\\n"
    return 0
  fi
  
  if ! curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list 2>/dev/null \
      | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
      | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null 2>&1; then
    echo -e "${YELLOW}#${RESET} Warning: Failed to add NVIDIA container toolkit repository. Continuing anyway...\\n"
    return 0
  fi
  
  if ! sudo apt-get update 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: Failed to update package list. Continuing anyway...\\n"
    return 0
  fi
  
  if ! sudo apt-get install -y nvidia-container-toolkit 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: Failed to install NVIDIA container toolkit. Continuing anyway...\\n"
    return 0
  fi
  
  echo -e "${GREEN}#${RESET} NVIDIA container toolkit installed successfully.\\n"
  
  # Configure Docker to use NVIDIA runtime
  echo -e "${YELLOW}#${RESET} Configuring Docker to use NVIDIA runtime...\\n"
  
  if ! sudo nvidia-ctk runtime configure --runtime=docker 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} nvidia-ctk configure failed, attempting manual configuration...\\n"
    
    # Fallback: Manually configure daemon.json
    local daemon_json="/etc/docker/daemon.json"
    local config_success=false
    
    if [[ -f "$daemon_json" ]]; then
      # Backup existing config (best effort)
      sudo cp "$daemon_json" "${daemon_json}.backup" 2>/dev/null || true
      
      # Check if nvidia runtime already exists
      if ! grep -q '"nvidia"' "$daemon_json" 2>/dev/null; then
        # Add nvidia runtime to existing config using jq if available
        if command -v jq &> /dev/null; then
          if sudo jq '. + {"runtimes": {"nvidia": {"path": "nvidia-container-runtime", "runtimeArgs": []}}}' "$daemon_json" > /tmp/daemon.json.tmp 2>/dev/null; then
            if sudo mv /tmp/daemon.json.tmp "$daemon_json" 2>/dev/null; then
              config_success=true
            fi
          fi
          # Clean up temp file if move failed
          sudo rm -f /tmp/daemon.json.tmp 2>/dev/null || true
        else
          echo -e "${YELLOW}#${RESET} jq not available, skipping manual daemon.json configuration...\\n"
        fi
      else
        config_success=true  # Already configured
      fi
    else
      # Create new daemon.json with nvidia runtime (best effort)
      if echo '{"runtimes":{"nvidia":{"path":"nvidia-container-runtime","runtimeArgs":[]}}}' | sudo tee "$daemon_json" > /dev/null 2>&1; then
        config_success=true
      fi
    fi
    
    if ! $config_success; then
      echo -e "${YELLOW}#${RESET} Manual daemon.json configuration unsuccessful. GPU support may require manual setup.\\n"
    fi
  fi
  
  # Restart Docker service
  echo -e "${YELLOW}#${RESET} Restarting Docker service...\\n"
  if ! sudo systemctl restart docker 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: Failed to restart Docker service. You may need to restart it manually.\\n"
    return 0
  fi
  
  # Verify NVIDIA runtime is available
  echo -e "${YELLOW}#${RESET} Verifying NVIDIA runtime configuration...\\n"
  sleep 2  # Give Docker a moment to fully restart
  
  if docker info 2>/dev/null | grep -q "nvidia"; then
    echo -e "${GREEN}#${RESET} NVIDIA runtime successfully configured and verified.\\n"
  else
    echo -e "${YELLOW}#${RESET} Warning: NVIDIA runtime not detected in Docker info. GPU acceleration may not work.\\n"
    echo -e "${YELLOW}#${RESET} You may need to manually configure /etc/docker/daemon.json and restart Docker.\\n"
  fi
  
  echo -e "${GREEN}#${RESET} NVIDIA container toolkit configuration completed.\\n"
}

get_install_confirmation(){
  if artifact_mode_enabled && [[ "${existing_install}" == 'true' ]]; then
    # Re-running artifact mode over an existing install is the supported offline
    # update path: new images and helper scripts are applied, data is kept.
    echo -e "${YELLOW}#${RESET} An existing Project NOMAD installation was found at ${NOMAD_DIR}."
    echo -e "${YELLOW}#${RESET} This will update it from the artifact bundle, keeping your database, installed apps and content."
    echo -e "${YELLOW}#${RESET} Backing up ${NOMAD_DIR} first is still recommended."
    read -p "Are you sure you want to continue? (y/N): " choice
    case "$choice" in
      y|Y )
        echo -e "${GREEN}#${RESET} User chose to continue with the update."
        return 0
        ;;
      * )
        echo "User chose not to continue with the update."
        exit 0
        ;;
    esac
  fi

  echo -e "${YELLOW}#${RESET} This script will install Project NOMAD and its dependencies on your machine."
  echo -e "${YELLOW}#${RESET} If you already have Project NOMAD installed with customized config or data, please be aware that running this installation script may overwrite existing files and configurations. It is highly recommended to back up any important data/configs before proceeding."
  read -p "Are you sure you want to continue? (y/N): " choice
  case "$choice" in
    y|Y )
      echo -e "${GREEN}#${RESET} User chose to continue with the installation."
      ;;
    * )
      echo "User chose not to continue with the installation."
      exit 0
      ;;
  esac
}

accept_terms() {
  printf "\n\n"
  echo "License Agreement & Terms of Use"
  echo "__________________________"
  printf "\n\n"
  echo "Project NOMAD is licensed under the Apache License 2.0. The full license can be found at https://www.apache.org/licenses/LICENSE-2.0 or in the LICENSE file of this repository."
  printf "\n"
  echo "By accepting this agreement, you acknowledge that you have read and understood the terms and conditions of the Apache License 2.0 and agree to be bound by them while using Project NOMAD"
  echo -e "\n\n"
  read -p "I have read and accept License Agreement & Terms of Use (y/N)? " choice
  case "$choice" in
    y|Y )
      accepted_terms='true'
      ;;
    * )
      echo "License Agreement & Terms of Use not accepted. Installation cannot continue."
      exit 1
      ;;
  esac
}

create_nomad_directory(){
  # Ensure the main installation directory exists
  if [[ ! -d "$NOMAD_DIR" ]]; then
    echo -e "${YELLOW}#${RESET} Creating directory for Project NOMAD at $NOMAD_DIR...\\n"
    sudo mkdir -p "$NOMAD_DIR"
    sudo chown "$(whoami):$(whoami)" "$NOMAD_DIR"

    echo -e "${GREEN}#${RESET} Directory created successfully.\\n"
  else
    echo -e "${GREEN}#${RESET} Directory $NOMAD_DIR already exists.\\n"
  fi

  # Also ensure the directory has a /storage/logs/ subdirectory
  sudo mkdir -p "${NOMAD_DIR}/storage/logs"

  # Create a admin.log file in the logs directory
  sudo touch "${NOMAD_DIR}/storage/logs/admin.log"
}

copy_artifact_payload_file() {
  local source_name="$1"
  local destination="$2"

  if [[ ! -f "${artifact_payload_dir}/${source_name}" ]]; then
    header_red
    echo -e "${RED}#${RESET} Required file missing from the artifact bundle payload: ${source_name}"
    exit 1
  fi

  if ! cp "${artifact_payload_dir}/${source_name}" "${destination}"; then
    header_red
    echo -e "${RED}#${RESET} Failed to copy ${source_name} from the artifact bundle to ${destination}."
    exit 1
  fi
}

download_management_compose_file() {
  local compose_file_path="${NOMAD_DIR}/compose.yml"

  echo -e "${YELLOW}#${RESET} Downloading docker-compose file for management...\\n"
  if ! curl -fsSL "$MANAGEMENT_COMPOSE_FILE_URL" -o "$compose_file_path"; then
    echo -e "${RED}#${RESET} Failed to download the docker compose file. Please check the URL and try again."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Docker compose file downloaded successfully to $compose_file_path.\\n"
}

copy_management_compose_file_from_artifacts() {
  local compose_file_path="${NOMAD_DIR}/compose.yml"

  echo -e "${YELLOW}#${RESET} Installing docker-compose file for management from the artifact bundle...\\n"
  copy_artifact_payload_file management_compose.yaml "$compose_file_path"
  # Layered at startup to force pull_policy: never for every service, so the
  # canonical compose file keeps its normal pull_policy: always.
  copy_artifact_payload_file compose.artifact.yml "${NOMAD_DIR}/compose.artifact.yml"
  echo -e "${GREEN}#${RESET} Docker compose file installed successfully to $compose_file_path.\\n"
}

compose_env_value() {
  # Reads a "- KEY=value" entry from a compose file. Prints nothing when the key
  # is absent or still holds the placeholder.
  local key="$1" file="$2" value
  [[ -f "$file" ]] || return 0
  value="$(awk -v key="${key}" '
    $0 ~ "^[[:space:]]*-[[:space:]]*" key "=" {
      sub("^[[:space:]]*-[[:space:]]*" key "=", "", $0)
      print
      exit
    }
  ' "$file")"
  [[ "$value" != 'replaceme' ]] || return 0
  echo "$value"
}

detect_existing_installation() {
  # Must run before the compose file is replaced, so an update can carry the
  # generated credentials forward instead of orphaning the existing database.
  local compose_file_path="${NOMAD_DIR}/compose.yml"
  [[ -f "$compose_file_path" ]] || return 0

  existing_app_key="$(compose_env_value APP_KEY "$compose_file_path")"
  existing_db_password="$(compose_env_value MYSQL_PASSWORD "$compose_file_path")"
  existing_db_root_password="$(compose_env_value MYSQL_ROOT_PASSWORD "$compose_file_path")"
  existing_url="$(compose_env_value URL "$compose_file_path")"

  if [[ -n "$existing_app_key" && -n "$existing_db_password" && -n "$existing_db_root_password" ]]; then
    existing_install='true'
  fi
}

configure_management_compose_file() {
  local compose_file_path="${NOMAD_DIR}/compose.yml"
  local app_key db_root_password db_user_password

  # Re-running artifact mode over an existing install is an update, not a fresh
  # install: keep the credentials the database was initialised with so its data,
  # installed apps and settings survive. MySQL only applies these passwords on
  # first startup, so regenerating them here is what would force wiping the data
  # directory.
  if artifact_mode_enabled && [[ "${existing_install}" == 'true' ]]; then
    echo -e "${YELLOW}#${RESET} Existing Project NOMAD installation detected — updating in place and keeping your data.\\n"
    app_key="${existing_app_key}"
    db_root_password="${existing_db_root_password}"
    db_user_password="${existing_db_password}"
  else
    app_key=$(generateRandomPass)
    db_root_password=$(generateRandomPass)
    db_user_password=$(generateRandomPass)

    # If MySQL data directory exists from a previous install attempt, remove it.
    # MySQL only initializes credentials on first startup when the data dir is empty.
    # If stale data exists, MySQL ignores the new passwords above and uses the old ones,
    # causing "Access denied" errors when the admin container tries to connect.
    if [[ -d "${NOMAD_DIR}/mysql" ]]; then
      echo -e "${YELLOW}#${RESET} Removing existing MySQL data directory to ensure credentials match...\\n"
      sudo rm -rf "${NOMAD_DIR}/mysql"
    fi
  fi

  # Inject dynamic env values into the compose file
  echo -e "${YELLOW}#${RESET} Configuring docker-compose file env variables...\\n"
  if artifact_mode_enabled && [[ -n "${existing_url}" ]]; then
    # Keep the address the instance is already reachable at rather than silently
    # repointing it during an update.
    sed -i "s|URL=replaceme|URL=${existing_url}|g" "$compose_file_path"
  else
    sed -i "s|URL=replaceme|URL=http://${local_ip_address}:8080|g" "$compose_file_path"
  fi
  sed -i "s|APP_KEY=replaceme|APP_KEY=${app_key}|g" "$compose_file_path"
  
  sed -i "s|DB_PASSWORD=replaceme|DB_PASSWORD=${db_user_password}|g" "$compose_file_path"
  sed -i "s|MYSQL_ROOT_PASSWORD=replaceme|MYSQL_ROOT_PASSWORD=${db_root_password}|g" "$compose_file_path"
  sed -i "s|MYSQL_PASSWORD=replaceme|MYSQL_PASSWORD=${db_user_password}|g" "$compose_file_path"
  
  echo -e "${GREEN}#${RESET} Docker compose file configured successfully.\\n"
}

setup_management_compose_file() {
  # Read the outgoing compose file before it is overwritten.
  detect_existing_installation

  if artifact_mode_enabled; then
    copy_management_compose_file_from_artifacts
  else
    download_management_compose_file
  fi
  configure_management_compose_file
}

download_helper_scripts() {
  local start_script_path="${NOMAD_DIR}/start_nomad.sh"
  local stop_script_path="${NOMAD_DIR}/stop_nomad.sh"
  local update_script_path="${NOMAD_DIR}/update_nomad.sh"

  echo -e "${YELLOW}#${RESET} Downloading helper scripts...\\n"
  if ! curl -fsSL --retry 5 --retry-delay 3 "$START_SCRIPT_URL" -o "$start_script_path"; then
    echo -e "${RED}#${RESET} Failed to download the start script. Please check the URL and try again."
    exit 1
  fi
  chmod +x "$start_script_path"

  if ! curl -fsSL --retry 5 --retry-delay 3 "$STOP_SCRIPT_URL" -o "$stop_script_path"; then
    echo -e "${RED}#${RESET} Failed to download the stop script. Please check the URL and try again."
    exit 1
  fi
  chmod +x "$stop_script_path"

  if ! curl -fsSL --retry 5 --retry-delay 3 "$UPDATE_SCRIPT_URL" -o "$update_script_path"; then
    echo -e "${RED}#${RESET} Failed to download the update script. Please check the URL and try again."
    exit 1
  fi
  chmod +x "$update_script_path"

  echo -e "${GREEN}#${RESET} Helper scripts downloaded successfully to $start_script_path, $stop_script_path, and $update_script_path.\\n"
}

copy_helper_scripts_from_artifacts() {
  local start_script_path="${NOMAD_DIR}/start_nomad.sh"
  local stop_script_path="${NOMAD_DIR}/stop_nomad.sh"
  local update_script_path="${NOMAD_DIR}/update_nomad.sh"

  echo -e "${YELLOW}#${RESET} Installing helper scripts from the artifact bundle...\\n"
  copy_artifact_payload_file start_nomad.sh "$start_script_path"
  chmod +x "$start_script_path"

  copy_artifact_payload_file stop_nomad.sh "$stop_script_path"
  chmod +x "$stop_script_path"

  copy_artifact_payload_file update_nomad.sh "$update_script_path"
  chmod +x "$update_script_path"

  # The uninstall script is normally fetched from GitHub on demand, which a
  # disconnected host cannot do. Ship it alongside the others when the bundle
  # carries it.
  if [[ -f "${artifact_payload_dir}/uninstall_nomad.sh" ]]; then
    copy_artifact_payload_file uninstall_nomad.sh "${NOMAD_DIR}/uninstall_nomad.sh"
    chmod +x "${NOMAD_DIR}/uninstall_nomad.sh"
  fi

  echo -e "${GREEN}#${RESET} Helper scripts installed successfully to $start_script_path, $stop_script_path, and $update_script_path.\\n"
}

setup_helper_scripts() {
  if artifact_mode_enabled; then
    copy_helper_scripts_from_artifacts
  else
    download_helper_scripts
  fi
}

load_artifact_images() {
  echo -e "${YELLOW}#${RESET} Loading Docker images from the artifact bundle...\\n"

  local archive
  local archives_loaded=0
  for archive in "${artifact_image_dir}"/*.tar; do
    [[ -f "$archive" ]] || continue
    # Skip AppleDouble sidecars ("._core-images.tar"), which macOS leaves on
    # FAT/exFAT media next to real files. They match *.tar but are metadata.
    [[ "$(basename "$archive")" != ._* ]] || continue
    echo -e "${YELLOW}#${RESET} Loading $(basename "$archive")...\\n"
    if ! sudo docker load -i "$archive"; then
      header_red
      echo -e "${RED}#${RESET} Failed to load Docker images from $(basename "$archive")."
      exit 1
    fi
    archives_loaded=$((archives_loaded + 1))
  done

  if [[ "$archives_loaded" -eq 0 ]]; then
    header_red
    echo -e "${RED}#${RESET} No Docker image archives were found in ${artifact_image_dir}."
    exit 1
  fi

  # Fail closed: the stack starts with --pull never, so a management image that
  # did not make it into the archive must be caught here with a clear message
  # rather than as an opaque Compose failure.
  local image
  while IFS= read -r image; do
    [[ -n "$image" ]] || continue
    if ! sudo docker image inspect "$image" &> /dev/null; then
      header_red
      echo -e "${RED}#${RESET} The bundle lists image ${image} but it is not present after loading."
      echo -e "${RED}#${RESET} Rebuild the bundle on a connected machine and try again."
      exit 1
    fi
  done < "${artifact_image_dir}/core-images.txt"

  echo -e "${GREEN}#${RESET} Docker images loaded successfully from the artifact bundle.\\n"
}

seed_artifact_content() {
  # Optional extension point: a bundle may carry pre-staged NOMAD storage
  # content. Transporting files here does not make every optional app or content
  # type installable offline — see admin/docs/offline-install.md.
  [[ -d "${NOMAD_ARTIFACT_PATH}/content" ]] || return 0

  echo -e "${YELLOW}#${RESET} Seeding pre-staged content into ${NOMAD_DIR}/storage...\\n"
  sudo mkdir -p "${NOMAD_DIR}/storage"
  # -n so re-running never overwrites content the user has changed or replaced;
  # new files in a later bundle are still added.
  if ! sudo cp -a -n "${NOMAD_ARTIFACT_PATH}/content/." "${NOMAD_DIR}/storage/"; then
    header_red
    echo -e "${RED}#${RESET} Failed to seed pre-staged content from the artifact bundle."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Pre-staged content seeded successfully.\\n"
}

start_management_containers() {
  echo -e "${YELLOW}#${RESET} Starting management containers using docker compose...\\n"

  local compose_args=(-p project-nomad -f "${NOMAD_DIR}/compose.yml")
  if artifact_mode_enabled; then
    # Layer the bundle's override (pull_policy: never for every service) and
    # forbid pulls outright, so startup uses only the images loaded above.
    compose_args+=(-f "${NOMAD_DIR}/compose.artifact.yml" up -d --pull never)
  else
    compose_args+=(up -d)
  fi

  if ! sudo docker compose "${compose_args[@]}"; then
    echo -e "${RED}#${RESET} Failed to start management containers. Please check the logs and try again."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Management containers started successfully.\\n"
}

get_local_ip() {
  local_ip_address=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [[ -n "$local_ip_address" ]]; then
    has_lan_address='true'
    return 0
  fi

  if artifact_mode_enabled; then
    # A genuinely disconnected target may have no LAN address at all. That must
    # not block an offline install, so fall back to localhost and simply don't
    # advertise a LAN URL.
    echo -e "${YELLOW}#${RESET} No LAN address detected. Project NOMAD will be reachable at http://localhost:8080.\\n"
    local_ip_address='localhost'
    return 0
  fi

  echo -e "${RED}#${RESET} Unable to determine local IP address. Please check your network configuration."
  exit 1
}
verify_gpu_setup() {
  # This function only displays GPU setup status and is completely non-blocking
  # It never exits or returns error codes - purely informational
  
  echo -e "\\n${YELLOW}#${RESET} GPU Setup Verification\\n"
  echo -e "${YELLOW}===========================================${RESET}\\n"
  
  # Check if NVIDIA GPU is present
  if command -v nvidia-smi &> /dev/null; then
    echo -e "${GREEN}✓${RESET} NVIDIA GPU detected:"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | while read -r line; do
      echo -e "  ${WHITE_R}$line${RESET}"
    done
    echo ""
  else
    echo -e "${YELLOW}○${RESET} No NVIDIA GPU detected (nvidia-smi not available)\\n"
  fi
  
  # Check if NVIDIA Container Toolkit is installed
  if command -v nvidia-ctk &> /dev/null; then
    echo -e "${GREEN}✓${RESET} NVIDIA Container Toolkit installed: $(nvidia-ctk --version 2>/dev/null | head -n1)\\n"
  else
    echo -e "${YELLOW}○${RESET} NVIDIA Container Toolkit not installed\\n"
  fi
  
  # Check if Docker has NVIDIA runtime
  if docker info 2>/dev/null | grep -q "nvidia"; then
    echo -e "${GREEN}✓${RESET} Docker NVIDIA runtime configured\\n"
  else
    echo -e "${YELLOW}○${RESET} Docker NVIDIA runtime not detected\\n"
  fi
  
  # Check for AMD GPU — restrict to display controller classes to avoid false positives
  # from AMD CPU host bridges, PCI bridges, and chipset devices.
  local has_amd_gpu='false'
  local amd_gfx_version=''
  if command -v lspci &> /dev/null; then
    if lspci 2>/dev/null | grep -iE "VGA|3D controller|Display" | grep -iE "amd|radeon" &> /dev/null; then
      has_amd_gpu='true'
      echo -e "${GREEN}✓${RESET} AMD GPU detected — ROCm acceleration will be configured automatically when AI Assistant is installed.\\n"

      # Map AMD codename → gfx version so the admin can pick the right HSA_OVERRIDE_GFX_VERSION.
      # gfx1030/1100/1101/1102 are on AMD's official ROCm allowlist and need NO override —
      # forcing one (e.g. 11.0.0) breaks GPU discovery on these. Other variants do need it.
      local amd_devices
      amd_devices=$(lspci -vmm 2>/dev/null | awk -F'\t' '/^Class:.*(VGA|3D|Display)/{c=1} c && /^Device:/{print $2; c=0}')
      if echo "${amd_devices}" | grep -iq 'Navi 21'; then
        amd_gfx_version='gfx1030'
      elif echo "${amd_devices}" | grep -iq 'Navi 22'; then
        amd_gfx_version='gfx1031'
      elif echo "${amd_devices}" | grep -iq 'Navi 23'; then
        amd_gfx_version='gfx1032'
      elif echo "${amd_devices}" | grep -iq 'Navi 24'; then
        amd_gfx_version='gfx1034'
      elif echo "${amd_devices}" | grep -iq 'Rembrandt'; then
        amd_gfx_version='gfx1035'
      elif echo "${amd_devices}" | grep -iEq 'Phoenix[0-9]?|Hawk Point|Radeon (780M|760M)'; then
        # Phoenix (Ryzen 7040) / Hawk Point (Ryzen 8040) — 780M & 760M are both gfx1103.
        # lspci device strings vary (Phoenix1/Phoenix2/Phoenix3, "Hawk Point", or the bare
        # "Radeon 780M Graphics" marketing name), so match all of them or the marker goes
        # missing and the 780M silently drops to CPU. Kept before the Strix branches so a
        # "Radeon 780M" string can't be miscaught. See gfx1103 regression.
        amd_gfx_version='gfx1103'
      elif echo "${amd_devices}" | grep -iEq 'Strix Halo'; then
        amd_gfx_version='gfx1151'
      elif echo "${amd_devices}" | grep -iEq 'Strix( Point)?'; then
        amd_gfx_version='gfx1150'
      elif echo "${amd_devices}" | grep -iq 'Navi 31'; then
        amd_gfx_version='gfx1100'
      elif echo "${amd_devices}" | grep -iq 'Navi 32'; then
        amd_gfx_version='gfx1101'
      elif echo "${amd_devices}" | grep -iq 'Navi 33'; then
        amd_gfx_version='gfx1102'
      fi
    fi
  fi

  # Write detected GPU type to a marker file the admin container can read. The admin
  # container lacks lspci and AMD GPUs don't register a Docker runtime, so this is the
  # only reliable way for the admin to know an AMD GPU is present at install time.
  local gpu_marker_path="${NOMAD_DIR}/storage/.nomad-gpu-type"
  if command -v nvidia-smi &> /dev/null; then
    echo 'nvidia' | sudo tee "${gpu_marker_path}" > /dev/null 2>&1 || true
  elif [[ "${has_amd_gpu}" == 'true' ]]; then
    echo 'amd' | sudo tee "${gpu_marker_path}" > /dev/null 2>&1 || true
  else
    sudo rm -f "${gpu_marker_path}" 2>/dev/null || true
  fi

  # Companion marker used by the admin to pick the right HSA_OVERRIDE_GFX_VERSION for
  # the detected card. Absence of this file means "unknown gfx" — the admin falls back
  # to its built-in default. Always rewrite (or remove) on install to keep state fresh.
  local amd_gfx_marker_path="${NOMAD_DIR}/storage/.nomad-amd-gfx"
  if [[ -n "${amd_gfx_version}" ]]; then
    echo "${amd_gfx_version}" | sudo tee "${amd_gfx_marker_path}" > /dev/null 2>&1 || true
  else
    sudo rm -f "${amd_gfx_marker_path}" 2>/dev/null || true
  fi

  echo -e "${YELLOW}===========================================${RESET}\\n"

  # Summary
  if command -v nvidia-smi &> /dev/null && docker info 2>/dev/null | grep -q "nvidia"; then
    echo -e "${GREEN}#${RESET} GPU acceleration is properly configured! The AI Assistant will use your GPU.\\n"
  elif [[ "${has_amd_gpu}" == 'true' ]]; then
    echo -e "${GREEN}#${RESET} GPU acceleration will be enabled (AMD/ROCm) when AI Assistant is installed from the dashboard.\\n"
  else
    echo -e "${YELLOW}#${RESET} GPU acceleration not detected. The AI Assistant will run in CPU-only mode.\\n"
    if command -v nvidia-smi &> /dev/null && ! docker info 2>/dev/null | grep -q "nvidia"; then
      echo -e "${YELLOW}#${RESET} Tip: Your GPU is detected but Docker runtime is not configured.\\n"
      echo -e "${YELLOW}#${RESET} Try restarting Docker: ${WHITE_R}sudo systemctl restart docker${RESET}\\n"
    fi
  fi
}

success_message() {
  echo -e "${GREEN}#${RESET} Project NOMAD installation completed successfully!\\n"
  echo -e "${GREEN}#${RESET} Installation files are located at /opt/project-nomad\\n\n"
  echo -e "${GREEN}#${RESET} Project NOMAD's Command Center should automatically start whenever your device reboots. However, if you need to start it manually, you can always do so by running: ${WHITE_R}${NOMAD_DIR}/start_nomad.sh${RESET}\\n"
  if [[ "${has_lan_address}" == 'true' ]]; then
    echo -e "${GREEN}#${RESET} You can now access the management interface at http://localhost:8080 or http://${local_ip_address}:8080\\n"
  else
    # No LAN address was available (offline install on a host with no network).
    echo -e "${GREEN}#${RESET} You can now access the management interface at http://localhost:8080\\n"
  fi
  echo -e "${GREEN}#${RESET} Thank you for supporting Project NOMAD!\\n"
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Main Script                                                                                           #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

# The test suite sources this script to exercise individual functions. Every
# other invocation runs the installer normally.
if [[ "${NOMAD_INSTALLER_LIB_ONLY:-}" == '1' ]]; then
  return 0 2>/dev/null || exit 0
fi

parse_installer_args "$@"

# Pre-flight checks
check_is_debian_based
check_is_x86_64
check_is_bash
check_has_sudo
if artifact_mode_enabled; then
  # Artifact mode is fail-closed from here on: no dependency is acquired over
  # the network, so the bundle is validated up front instead.
  validate_artifact_bundle
  # Read before anything is written, so the confirmation prompt can tell the
  # user whether this is a fresh install or an in-place update.
  detect_existing_installation
else
  ensure_dependencies_installed
fi
check_is_debug_mode

# Main install
get_install_confirmation
accept_terms
if artifact_mode_enabled; then
  install_packages_from_artifacts
  check_docker_compose
  setup_nvidia_container_toolkit_from_artifacts
else
  ensure_docker_installed
  check_docker_compose
  setup_nvidia_container_toolkit
fi
get_local_ip
create_nomad_directory
setup_helper_scripts
setup_management_compose_file
if artifact_mode_enabled; then
  load_artifact_images
  seed_artifact_content
fi
start_management_containers
verify_gpu_setup
success_message

# free_space_check() {
#   if [[ "$(df -B1 / | awk 'NR==2{print $4}')" -le '5368709120' ]]; then
#     header_red
#     echo -e "${YELLOW}#${RESET} You only have $(df -B1 / | awk 'NR==2{print $4}' | awk '{ split( "B KB MB GB TB PB EB ZB YB" , v ); s=1; while( $1>1024 && s<9 ){ $1/=1024; s++ } printf "%.1f %s", $1, v[s] }') of disk space available on \"/\"... \\n"
#     while true; do
#       read -rp $'\033[39m#\033[0m Do you want to proceed with running the script? (y/N) ' yes_no
#       case "$yes_no" in
#          [Nn]*|"")
#             free_space_check_response="Cancel script"
#             free_space_check_date="$(date +%s)"
#             echo -e "${YELLOW}#${RESET} OK... Please free up disk space before running the script again..."
#             cancel_script
#             break;;
#          [Yy]*)
#             free_space_check_response="Proceed at own risk"
#             free_space_check_date="$(date +%s)"
#             echo -e "${YELLOW}#${RESET} OK... Proceeding with the script.. please note that failures may occur due to not enough disk space... \\n"; sleep 10
#             break;;
#          *) echo -e "\\n${RED}#${RESET} Invalid input, please answer Yes or No (y/n)...\\n"; sleep 3;;
#       esac
#     done
#     if [[ -n "$(command -v jq)" ]]; then
#       if [[ "$(dpkg-query --showformat='${version}' --show jq 2> /dev/null | sed -e 's/.*://' -e 's/-.*//g' -e 's/[^0-9.]//g' -e 's/\.//g' | sort -V | tail -n1)" -ge "16" && -e "${eus_dir}/db/db.json" ]]; then
#         jq '.scripts."'"${script_name}"'" += {"warnings": {"low-free-disk-space": {"response": "'"${free_space_check_response}"'", "detected-date": "'"${free_space_check_date}"'"}}}' "${eus_dir}/db/db.json" > "${eus_dir}/db/db.json.tmp" 2>> "${eus_dir}/logs/eus-database-management.log"
#       else
#         jq '.scripts."'"${script_name}"'" = (.scripts."'"${script_name}"'" | . + {"warnings": {"low-free-disk-space": {"response": "'"${free_space_check_response}"'", "detected-date": "'"${free_space_check_date}"'"}}})' "${eus_dir}/db/db.json" > "${eus_dir}/db/db.json.tmp" 2>> "${eus_dir}/logs/eus-database-management.log"
#       fi
#       eus_database_move
#     fi
#   fi
# }
