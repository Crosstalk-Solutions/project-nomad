#!/bin/bash

# Project N.O.M.A.D. Installation Script (macOS / Apple Silicon)

###################################################################################################################################################################################################

# Script                | Project N.O.M.A.D. macOS Installation Script
# Version               | 1.0.0
# Author                | Fork by snfettig (based on Crosstalk Solutions, LLC)
# Original              | https://github.com/Crosstalk-Solutions/project-nomad

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Color Codes                                                                                           #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

RESET='\033[0m'
YELLOW='\033[1;33m'
WHITE_R='\033[39m'
GRAY_R='\033[39m'
RED='\033[1;31m'
GREEN='\033[1;32m'

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                  Constants & Variables                                                                                          #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

NOMAD_DIR="$HOME/project-nomad-data"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

script_option_debug='true'
accepted_terms='false'
local_ip_address=''

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Functions                                                                                             #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

header() {
  if [[ "${script_option_debug}" != 'true' ]]; then clear; clear; fi
  echo -e "${GREEN}#########################################################################${RESET}\\n"
}

header_red() {
  if [[ "${script_option_debug}" != 'true' ]]; then clear; clear; fi
  echo -e "${RED}#########################################################################${RESET}\\n"
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

check_is_macos() {
  if [[ "$(uname)" != "Darwin" ]]; then
    header_red
    echo -e "${RED}#${RESET} This script is designed to run on macOS only.\\n"
    echo -e "${RED}#${RESET} For Linux/Debian systems, use install_nomad.sh instead."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Running on macOS $(sw_vers -productVersion).\\n"

  local arch
  arch="$(uname -m)"
  if [[ "$arch" == "arm64" ]]; then
    echo -e "${GREEN}#${RESET} Apple Silicon (arm64) detected.\\n"
  else
    echo -e "${YELLOW}#${RESET} Architecture: ${arch}. This script is optimized for Apple Silicon but may work on Intel.\\n"
  fi
}

check_is_debug_mode() {
  if [[ "${script_option_debug}" == 'true' ]]; then
    echo -e "${YELLOW}#${RESET} Debug mode is enabled, the script will not clear the screen...\\n"
  else
    clear; clear
  fi
}

generateRandomPass() {
  local length="${1:-32}"
  LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$length"
}

ensure_docker_installed() {
  if ! command -v docker &> /dev/null; then
    echo -e "${RED}#${RESET} Docker is not installed.\\n"
    echo -e "${YELLOW}#${RESET} Please install Docker Desktop for macOS:\\n"
    echo -e "${WHITE_R}   brew install --cask docker${RESET}"
    echo -e "${WHITE_R}   or download from: https://www.docker.com/products/docker-desktop/${RESET}\\n"
    echo -e "${YELLOW}#${RESET} After installing, open Docker Desktop from Applications, then re-run this script."
    exit 1
  fi

  echo -e "${GREEN}#${RESET} Docker is installed.\\n"

  # Check if Docker daemon is running
  if ! docker info &> /dev/null; then
    echo -e "${YELLOW}#${RESET} Docker Desktop is not running. Attempting to start it...\\n"
    open -a Docker
    echo -e "${YELLOW}#${RESET} Waiting for Docker to start (this may take a moment)...\\n"
    local retries=30
    while ! docker info &> /dev/null && [[ $retries -gt 0 ]]; do
      sleep 2
      retries=$((retries - 1))
    done
    if ! docker info &> /dev/null; then
      echo -e "${RED}#${RESET} Docker Desktop did not start in time. Please start it manually and re-run this script."
      exit 1
    fi
    echo -e "${GREEN}#${RESET} Docker Desktop is now running.\\n"
  else
    echo -e "${GREEN}#${RESET} Docker Desktop is already running.\\n"
  fi
}

get_install_confirmation() {
  read -p "This script will install/update Project N.O.M.A.D. and its dependencies on your Mac. Are you sure you want to continue? (y/N): " choice
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
  echo "Project N.O.M.A.D. is licensed under the Apache License 2.0. The full license can be found at https://www.apache.org/licenses/LICENSE-2.0 or in the LICENSE file of this repository."
  printf "\n"
  echo "By accepting this agreement, you acknowledge that you have read and understood the terms and conditions of the Apache License 2.0 and agree to be bound by them while using Project N.O.M.A.D."
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

create_nomad_directory() {
  if [[ ! -d "$NOMAD_DIR" ]]; then
    echo -e "${YELLOW}#${RESET} Creating directory for Project N.O.M.A.D at $NOMAD_DIR...\\n"
    mkdir -p "$NOMAD_DIR"
    echo -e "${GREEN}#${RESET} Directory created successfully.\\n"
  else
    echo -e "${GREEN}#${RESET} Directory $NOMAD_DIR already exists.\\n"
  fi

  mkdir -p "${NOMAD_DIR}/storage/logs"
  touch "${NOMAD_DIR}/storage/logs/admin.log"
}

copy_compose_file() {
  local compose_src="${REPO_DIR}/install/management_compose_macos.yaml"
  local compose_dest="${NOMAD_DIR}/compose.yml"

  if [[ ! -f "$compose_src" ]]; then
    echo -e "${RED}#${RESET} macOS compose file not found at $compose_src"
    exit 1
  fi

  echo -e "${YELLOW}#${RESET} Copying docker-compose file...\\n"
  cp "$compose_src" "$compose_dest"

  local app_key
  local db_root_password
  local db_user_password
  app_key=$(generateRandomPass)
  db_root_password=$(generateRandomPass)
  db_user_password=$(generateRandomPass)

  echo -e "${YELLOW}#${RESET} Configuring docker-compose file env variables...\\n"

  # macOS sed requires '' after -i for in-place editing with no backup
  sed -i '' "s|URL=replaceme|URL=http://${local_ip_address}:8080|g" "$compose_dest"
  sed -i '' "s|APP_KEY=replaceme|APP_KEY=${app_key}|g" "$compose_dest"
  sed -i '' "s|DB_PASSWORD=replaceme|DB_PASSWORD=${db_user_password}|g" "$compose_dest"
  sed -i '' "s|MYSQL_ROOT_PASSWORD=replaceme|MYSQL_ROOT_PASSWORD=${db_root_password}|g" "$compose_dest"
  sed -i '' "s|MYSQL_PASSWORD=replaceme|MYSQL_PASSWORD=${db_user_password}|g" "$compose_dest"

  # Replace NOMAD_DIR placeholder with actual path
  sed -i '' "s|NOMAD_DIR_PLACEHOLDER|${NOMAD_DIR}|g" "$compose_dest"

  # Replace REPO_DIR placeholder with actual path
  sed -i '' "s|REPO_DIR_PLACEHOLDER|${REPO_DIR}|g" "$compose_dest"

  echo -e "${GREEN}#${RESET} Docker compose file configured successfully.\\n"
}

copy_support_files() {
  echo -e "${YELLOW}#${RESET} Copying support files...\\n"

  # Copy entrypoint script
  cp "${REPO_DIR}/install/entrypoint.sh" "${NOMAD_DIR}/entrypoint.sh"
  chmod +x "${NOMAD_DIR}/entrypoint.sh"

  # Download wait-for-it script
  echo -e "${YELLOW}#${RESET} Downloading wait-for-it script...\\n"
  if ! curl -fsSL "https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh" -o "${NOMAD_DIR}/wait-for-it.sh"; then
    echo -e "${RED}#${RESET} Failed to download wait-for-it script."
    exit 1
  fi
  chmod +x "${NOMAD_DIR}/wait-for-it.sh"

  # Copy sidecar-updater files
  mkdir -p "${NOMAD_DIR}/sidecar-updater"
  cp "${REPO_DIR}/install/sidecar-updater/Dockerfile" "${NOMAD_DIR}/sidecar-updater/Dockerfile"
  cp "${REPO_DIR}/install/sidecar-updater/update-watcher.sh" "${NOMAD_DIR}/sidecar-updater/update-watcher.sh"
  chmod +x "${NOMAD_DIR}/sidecar-updater/update-watcher.sh"

  # Copy sidecar-disk-collector files (macOS version)
  mkdir -p "${NOMAD_DIR}/sidecar-disk-collector"
  cp "${REPO_DIR}/install/sidecar-disk-collector-macos/Dockerfile" "${NOMAD_DIR}/sidecar-disk-collector/Dockerfile"
  cp "${REPO_DIR}/install/sidecar-disk-collector-macos/collect-disk-info.sh" "${NOMAD_DIR}/sidecar-disk-collector/collect-disk-info.sh"
  chmod +x "${NOMAD_DIR}/sidecar-disk-collector/collect-disk-info.sh"

  # Copy helper scripts
  cp "${REPO_DIR}/install/start_nomad.sh" "${NOMAD_DIR}/start_nomad.sh"
  cp "${REPO_DIR}/install/stop_nomad.sh" "${NOMAD_DIR}/stop_nomad.sh"
  cp "${REPO_DIR}/install/update_nomad_macos.sh" "${NOMAD_DIR}/update_nomad.sh"
  chmod +x "${NOMAD_DIR}/start_nomad.sh" "${NOMAD_DIR}/stop_nomad.sh" "${NOMAD_DIR}/update_nomad.sh"

  echo -e "${GREEN}#${RESET} Support files copied successfully.\\n"
}

ensure_ollama_installed() {
  if command -v ollama &> /dev/null; then
    echo -e "${GREEN}#${RESET} Ollama is already installed.\\n"
  else
    echo -e "${YELLOW}#${RESET} Installing Ollama for native Metal GPU acceleration...\\n"
    if command -v brew &> /dev/null; then
      brew install ollama
    else
      echo -e "${YELLOW}#${RESET} Homebrew not found. Please install Ollama manually:\\n"
      echo -e "${WHITE_R}   brew install ollama${RESET}"
      echo -e "${WHITE_R}   or download from: https://ollama.com/download${RESET}\\n"
      echo -e "${YELLOW}#${RESET} Continuing without Ollama. You can install it later.\\n"
      return 0
    fi
  fi

  # Start Ollama if not already running
  if ! curl -s http://localhost:11434/api/tags &> /dev/null; then
    echo -e "${YELLOW}#${RESET} Starting Ollama service...\\n"
    ollama serve &> /dev/null &
    sleep 3
    if curl -s http://localhost:11434/api/tags &> /dev/null; then
      echo -e "${GREEN}#${RESET} Ollama is now running with Metal GPU acceleration.\\n"
    else
      echo -e "${YELLOW}#${RESET} Ollama started but may need a moment. You can start it manually with: ollama serve\\n"
    fi
  else
    echo -e "${GREEN}#${RESET} Ollama is already running at http://localhost:11434\\n"
  fi
}

build_admin_image() {
  echo -e "${YELLOW}#${RESET} Building Project N.O.M.A.D admin image for $(uname -m)...\\n"
  echo -e "${YELLOW}#${RESET} This may take several minutes on the first run...\\n"

  if ! docker build -t project-nomad-admin:latest -f "${REPO_DIR}/Dockerfile" "${REPO_DIR}"; then
    echo -e "${RED}#${RESET} Failed to build the admin Docker image. Please check the logs above."
    exit 1
  fi

  echo -e "${GREEN}#${RESET} Admin image built successfully for $(uname -m).\\n"
}

start_management_containers() {
  echo -e "${YELLOW}#${RESET} Starting management containers using docker compose...\\n"
  if ! docker compose -p project-nomad -f "${NOMAD_DIR}/compose.yml" up -d; then
    echo -e "${RED}#${RESET} Failed to start management containers. Please check the logs and try again."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Management containers started successfully.\\n"
}

get_local_ip() {
  # macOS uses ipconfig instead of hostname -I
  local_ip_address=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
  if [[ -z "$local_ip_address" ]]; then
    local_ip_address="localhost"
  fi
}

success_message() {
  echo -e "${GREEN}#${RESET} Project N.O.M.A.D installation completed successfully!\\n"
  echo -e "${GREEN}#${RESET} Installation data is located at ${NOMAD_DIR}\\n\\n"
  echo -e "${GREEN}#${RESET} To start:  ${WHITE_R}${NOMAD_DIR}/start_nomad.sh${RESET}"
  echo -e "${GREEN}#${RESET} To stop:   ${WHITE_R}${NOMAD_DIR}/stop_nomad.sh${RESET}"
  echo -e "${GREEN}#${RESET} To update: ${WHITE_R}${NOMAD_DIR}/update_nomad.sh${RESET}\\n"
  echo -e "${GREEN}#${RESET} You can now access the management interface at http://localhost:8080 or http://${local_ip_address}:8080\\n"
  echo -e "${GREEN}#${RESET} Thank you for supporting Project N.O.M.A.D!\\n"
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Main Script                                                                                           #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

# Pre-flight checks
check_is_macos
check_is_bash
check_is_debug_mode

# Main install
get_install_confirmation
accept_terms
ensure_docker_installed
ensure_ollama_installed
get_local_ip
create_nomad_directory
copy_compose_file
copy_support_files
build_admin_image
start_management_containers
success_message
