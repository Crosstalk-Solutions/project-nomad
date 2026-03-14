#!/bin/bash

# Project N.O.M.A.D. Installation Script

###################################################################################################################################################################################################

# Script                | Project N.O.M.A.D. Installation Script
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

WHIPTAIL_TITLE="Project N.O.M.A.D Installation"
NOMAD_DIR="/opt/project-nomad"

# Base URL for downloading install assets. Override to test from a fork/branch:
#   sudo NOMAD_INSTALL_BASE_URL="https://raw.githubusercontent.com/trek-e/project-nomad/refs/heads/feature/compose-integration" bash install_nomad.sh
NOMAD_INSTALL_BASE_URL="${NOMAD_INSTALL_BASE_URL:-https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main}"

MANAGEMENT_COMPOSE_FILE_URL="${NOMAD_INSTALL_BASE_URL}/install/management_compose.yaml"
ENTRYPOINT_SCRIPT_URL="${NOMAD_INSTALL_BASE_URL}/install/entrypoint.sh"
SIDECAR_UPDATER_DOCKERFILE_URL="${NOMAD_INSTALL_BASE_URL}/install/sidecar-updater/Dockerfile"
SIDECAR_UPDATER_SCRIPT_URL="${NOMAD_INSTALL_BASE_URL}/install/sidecar-updater/update-watcher.sh"
START_SCRIPT_URL="${NOMAD_INSTALL_BASE_URL}/install/start_nomad.sh"
STOP_SCRIPT_URL="${NOMAD_INSTALL_BASE_URL}/install/stop_nomad.sh"
UPDATE_SCRIPT_URL="${NOMAD_INSTALL_BASE_URL}/install/update_nomad.sh"
WAIT_FOR_IT_SCRIPT_URL="https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh"
COLLECT_DISK_INFO_SCRIPT_URL="${NOMAD_INSTALL_BASE_URL}/install/collect_disk_info.sh"

script_option_debug='true'
accepted_terms='false'
local_ip_address=''

# Installation mode: 'standalone' or 'integrated'
INSTALL_MODE='standalone'

# Integration settings (populated during detection/prompting)
EXISTING_COMPOSE_PROJECT=''
EXISTING_COMPOSE_FILE=''
REUSE_MYSQL=false
REUSE_REDIS=false
EXTERNAL_MYSQL_HOST=''
EXTERNAL_MYSQL_PORT=''
EXTERNAL_MYSQL_USER=''
EXTERNAL_MYSQL_PASSWORD=''
EXTERNAL_MYSQL_DATABASE=''
EXTERNAL_REDIS_HOST=''
EXTERNAL_REDIS_PORT=''
EXISTING_DOCKER_NETWORK=''
DETECTED_NVIDIA_RUNTIME=false

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

ensure_dependencies_installed() {
  local missing_deps=()

  # Check for curl
  if ! command -v curl &> /dev/null; then
    missing_deps+=("curl")
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

setup_nvidia_container_toolkit() {
  # This function attempts to set up NVIDIA GPU support but is non-blocking
  # Any failures will result in warnings but will NOT stop the installation process
  
  echo -e "${YELLOW}#${RESET} Checking for NVIDIA GPU...\\n"
  
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
  
  if ! $has_nvidia_gpu; then
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
  if ! curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey 2>/dev/null | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null; then
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
  read -p "This script will install/update Project N.O.M.A.D. and its dependencies on your machine. Are you sure you want to continue? (y/N): " choice
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

create_nomad_directory(){
  # Ensure the main installation directory exists
  if [[ ! -d "$NOMAD_DIR" ]]; then
    echo -e "${YELLOW}#${RESET} Creating directory for Project N.O.M.A.D at $NOMAD_DIR...\\n"
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

create_disk_info_file() {
  # Disk info file MUST be created before the admin container starts.
  # Otherwise, Docker will assume we meant to mount a directory and will create an empty directory at the mount point
  echo '{}' > /tmp/nomad-disk-info.json
}

download_management_compose_file() {
  local compose_file_path="${NOMAD_DIR}/compose.yml"

  echo -e "${YELLOW}#${RESET} Downloading docker-compose file for management...\\n"
  if ! curl -fsSL "$MANAGEMENT_COMPOSE_FILE_URL" -o "$compose_file_path"; then
    echo -e "${RED}#${RESET} Failed to download the docker compose file. Please check the URL and try again."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Docker compose file downloaded successfully to $compose_file_path.\\n"

  local app_key=$(generateRandomPass)
  local db_root_password=$(generateRandomPass)
  local db_user_password=$(generateRandomPass)

  # Inject dynamic env values into the compose file
  echo -e "${YELLOW}#${RESET} Configuring docker-compose file env variables...\\n"
  sed -i "s|URL=replaceme|URL=http://${local_ip_address}:8080|g" "$compose_file_path"
  sed -i "s|APP_KEY=replaceme|APP_KEY=${app_key}|g" "$compose_file_path"
  
  sed -i "s|DB_PASSWORD=replaceme|DB_PASSWORD=${db_user_password}|g" "$compose_file_path"
  sed -i "s|MYSQL_ROOT_PASSWORD=replaceme|MYSQL_ROOT_PASSWORD=${db_root_password}|g" "$compose_file_path"
  sed -i "s|MYSQL_PASSWORD=replaceme|MYSQL_PASSWORD=${db_user_password}|g" "$compose_file_path"
  
  echo -e "${GREEN}#${RESET} Docker compose file configured successfully.\\n"
}

download_wait_for_it_script() {
  local wait_for_it_script_path="${NOMAD_DIR}/wait-for-it.sh"

  echo -e "${YELLOW}#${RESET} Downloading wait-for-it script...\\n"
  if ! curl -fsSL "$WAIT_FOR_IT_SCRIPT_URL" -o "$wait_for_it_script_path"; then
    echo -e "${RED}#${RESET} Failed to download the wait-for-it script. Please check the URL and try again."
    exit 1
  fi
  chmod +x "$wait_for_it_script_path"
  echo -e "${GREEN}#${RESET} wait-for-it script downloaded successfully to $wait_for_it_script_path.\\n"
}

download_entrypoint_script() {
  local entrypoint_script_path="${NOMAD_DIR}/entrypoint.sh"

  echo -e "${YELLOW}#${RESET} Downloading entrypoint script...\\n"
  if ! curl -fsSL "$ENTRYPOINT_SCRIPT_URL" -o "$entrypoint_script_path"; then
    echo -e "${RED}#${RESET} Failed to download the entrypoint script. Please check the URL and try again."
    exit 1
  fi
  chmod +x "$entrypoint_script_path"
  echo -e "${GREEN}#${RESET} entrypoint script downloaded successfully to $entrypoint_script_path.\\n"
}

download_sidecar_files() {
  # Create sidecar-updater directory if it doesn't exist
  if [[ ! -d "${NOMAD_DIR}/sidecar-updater" ]]; then
    sudo mkdir -p "${NOMAD_DIR}/sidecar-updater"
    sudo chown "$(whoami):$(whoami)" "${NOMAD_DIR}/sidecar-updater"
  fi

  local sidecar_dockerfile_path="${NOMAD_DIR}/sidecar-updater/Dockerfile"
  local sidecar_script_path="${NOMAD_DIR}/sidecar-updater/update-watcher.sh"

  echo -e "${YELLOW}#${RESET} Downloading sidecar updater Dockerfile...\\n"
  if ! curl -fsSL "$SIDECAR_UPDATER_DOCKERFILE_URL" -o "$sidecar_dockerfile_path"; then
    echo -e "${RED}#${RESET} Failed to download the sidecar updater Dockerfile. Please check the URL and try again."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Sidecar updater Dockerfile downloaded successfully to $sidecar_dockerfile_path.\\n"

  echo -e "${YELLOW}#${RESET} Downloading sidecar updater script...\\n"
  if ! curl -fsSL "$SIDECAR_UPDATER_SCRIPT_URL" -o "$sidecar_script_path"; then
    echo -e "${RED}#${RESET} Failed to download the sidecar updater script. Please check the URL and try again."
    exit 1
  fi
  chmod +x "$sidecar_script_path"
  echo -e "${GREEN}#${RESET} Sidecar updater script downloaded successfully to $sidecar_script_path.\\n"
}

download_and_start_collect_disk_info_script() {
  local collect_disk_info_script_path="${NOMAD_DIR}/collect_disk_info.sh"

  echo -e "${YELLOW}#${RESET} Downloading collect_disk_info script...\\n"
  if ! curl -fsSL "$COLLECT_DISK_INFO_SCRIPT_URL" -o "$collect_disk_info_script_path"; then
    echo -e "${RED}#${RESET} Failed to download the collect_disk_info script. Please check the URL and try again."
    exit 1
  fi
  chmod +x "$collect_disk_info_script_path"
  echo -e "${GREEN}#${RESET} collect_disk_info script downloaded successfully to $collect_disk_info_script_path.\\n"

  # Start script in background and store PID for easy removal on uninstall
  echo -e "${YELLOW}#${RESET} Starting collect_disk_info script in the background...\\n"
  nohup bash "$collect_disk_info_script_path" > /dev/null 2>&1 &
  echo $! > "${NOMAD_DIR}/nomad-collect-disk-info.pid"
  echo -e "${GREEN}#${RESET} collect_disk_info script started successfully.\\n"
}

download_helper_scripts() {
  local start_script_path="${NOMAD_DIR}/start_nomad.sh"
  local stop_script_path="${NOMAD_DIR}/stop_nomad.sh"
  local update_script_path="${NOMAD_DIR}/update_nomad.sh"

  echo -e "${YELLOW}#${RESET} Downloading helper scripts...\\n"
  if ! curl -fsSL "$START_SCRIPT_URL" -o "$start_script_path"; then
    echo -e "${RED}#${RESET} Failed to download the start script. Please check the URL and try again."
    exit 1
  fi
  chmod +x "$start_script_path"

  if ! curl -fsSL "$STOP_SCRIPT_URL" -o "$stop_script_path"; then
    echo -e "${RED}#${RESET} Failed to download the stop script. Please check the URL and try again."
    exit 1
  fi
  chmod +x "$stop_script_path"

  if ! curl -fsSL "$UPDATE_SCRIPT_URL" -o "$update_script_path"; then
    echo -e "${RED}#${RESET} Failed to download the update script. Please check the URL and try again."
    exit 1
  fi
  chmod +x "$update_script_path"

  echo -e "${GREEN}#${RESET} Helper scripts downloaded successfully to $start_script_path, $stop_script_path, and $update_script_path.\\n"
}

start_management_containers() {
  echo -e "${YELLOW}#${RESET} Starting management containers using docker compose...\\n"
  if ! sudo docker compose -p project-nomad -f "${NOMAD_DIR}/compose.yml" up -d; then
    echo -e "${RED}#${RESET} Failed to start management containers. Please check the logs and try again."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Management containers started successfully.\\n"
}

get_local_ip() {
  local_ip_address=$(hostname -I | awk '{print $1}')
  if [[ -z "$local_ip_address" ]]; then
    echo -e "${RED}#${RESET} Unable to determine local IP address. Please check your network configuration."
    exit 1
  fi
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                        Docker Environment Detection & Integration                                                                               #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

detect_docker_environment() {
  # Detect existing Docker Compose projects, services, GPU runtime, and networks.
  # Sets global variables used by prompt_installation_mode and compose generation.

  echo -e "\n${YELLOW}#${RESET} Scanning existing Docker environment...\\n"

  # --- Compose projects ---
  local compose_projects=""
  if docker compose ls --format json &>/dev/null; then
    compose_projects=$(docker compose ls --format json 2>/dev/null)
  fi

  if [[ -n "$compose_projects" && "$compose_projects" != "[]" ]]; then
    echo -e "${GREEN}#${RESET} Existing Docker Compose projects detected:"
    docker compose ls 2>/dev/null | tail -n +2 | while IFS= read -r line; do
      echo -e "  ${WHITE_R}${line}${RESET}"
    done
    echo ""
  else
    echo -e "${GREEN}#${RESET} No existing Docker Compose projects detected.\\n"
  fi

  # --- NVIDIA runtime ---
  if docker info 2>/dev/null | grep -qi "nvidia"; then
    DETECTED_NVIDIA_RUNTIME=true
    echo -e "${GREEN}#${RESET} NVIDIA container runtime is available on this Docker host."

    # Find containers currently using NVIDIA GPU
    local gpu_containers
    gpu_containers=$(docker ps --format '{{.Names}}' 2>/dev/null | while read -r cname; do
      local rt
      rt=$(docker inspect --format '{{.HostConfig.Runtime}}' "$cname" 2>/dev/null)
      local devreqs
      devreqs=$(docker inspect --format '{{.HostConfig.DeviceRequests}}' "$cname" 2>/dev/null)
      if [[ "$rt" == "nvidia" ]] || echo "$devreqs" | grep -qi "nvidia" 2>/dev/null; then
        echo "$cname"
      fi
    done)

    if [[ -n "$gpu_containers" ]]; then
      echo -e "${YELLOW}#${RESET} Containers currently using NVIDIA GPU:"
      echo "$gpu_containers" | while IFS= read -r c; do
        echo -e "  ${WHITE_R}• ${c}${RESET}"
      done
      echo ""
      echo -e "${GREEN}#${RESET} NOMAD's AI Assistant will share the GPU with these containers."
      echo -e "  ${WHITE_R}Docker and NVIDIA handle GPU time-sharing automatically —${RESET}"
      echo -e "  ${WHITE_R}no exclusive access is needed.${RESET}"
    else
      echo -e "${GREEN}#${RESET} No containers currently using the GPU."
    fi
    echo ""
  else
    echo -e "${YELLOW}#${RESET} NVIDIA container runtime not detected.\\n"
  fi

  # --- Existing MySQL ---
  local existing_mysql
  existing_mysql=$(docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null | grep -i mysql | head -1)
  if [[ -n "$existing_mysql" ]]; then
    echo -e "${YELLOW}#${RESET} Existing MySQL container detected: ${WHITE_R}$(echo "$existing_mysql" | cut -f1)${RESET}"
  fi

  # --- Existing Redis ---
  local existing_redis
  existing_redis=$(docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null | grep -i redis | head -1)
  if [[ -n "$existing_redis" ]]; then
    echo -e "${YELLOW}#${RESET} Existing Redis container detected: ${WHITE_R}$(echo "$existing_redis" | cut -f1)${RESET}"
  fi

  # --- Docker networks ---
  # Store the default bridge and any compose-created networks for later use
  echo ""
}

prompt_installation_mode() {
  # If Docker has no running containers at all, skip the prompt — go standalone.
  local running_count
  running_count=$(docker ps -q 2>/dev/null | wc -l)

  if [[ "$running_count" -eq 0 ]]; then
    echo -e "${GREEN}#${RESET} No running containers detected. Using standalone installation.\\n"
    INSTALL_MODE='standalone'
    return
  fi

  echo -e "${YELLOW}#${RESET} Docker is already running services on this system.\\n"
  echo -e "  ${WHITE_R}1) Standalone${RESET} — Full isolated stack (own MySQL, Redis, network)"
  echo -e "     Best for: dedicated NOMAD devices, clean installs"
  echo ""
  echo -e "  ${WHITE_R}2) Integrated${RESET} — Join existing Docker environment"
  echo -e "     • Connects to an existing Docker network so services can discover each other"
  echo -e "     • Can reuse an existing MySQL and/or Redis instead of duplicating them"
  echo -e "     • GPU is shared automatically with other NVIDIA containers"
  echo -e "     • NOMAD manages its own compose file — your existing compose is never modified"
  echo -e "     Best for: servers already running Docker services (media, home automation, etc.)"
  echo ""

  local choice=""
  while [[ -z "$choice" ]]; do
    read -rp "$(echo -e "${WHITE_R}#${RESET}") Installation mode [1]: " choice
    choice="${choice:-1}"
    case "$choice" in
      1) INSTALL_MODE='standalone' ;;
      2) INSTALL_MODE='integrated' ;;
      *) echo -e "${RED}#${RESET} Invalid choice. Enter 1 or 2."; choice="" ;;
    esac
  done

  if [[ "$INSTALL_MODE" == "standalone" ]]; then
    echo -e "\n${GREEN}#${RESET} Using standalone installation.\\n"
    return
  fi

  echo -e "\n${GREEN}#${RESET} Using integrated installation.\\n"

  # --- Network selection ---
  prompt_network_selection

  # --- MySQL reuse ---
  prompt_mysql_reuse

  # --- Redis reuse ---
  prompt_redis_reuse
}

prompt_network_selection() {
  echo -e "${YELLOW}#${RESET} Docker Networks\\n"

  # List non-default networks (skip bridge, host, none)
  local networks
  networks=$(docker network ls --format '{{.Name}}' 2>/dev/null | grep -vE '^(bridge|host|none)$')

  if [[ -z "$networks" ]]; then
    echo -e "${YELLOW}#${RESET} No custom Docker networks found. NOMAD will create its own.\\n"
    return
  fi

  echo -e "  Available networks:"
  local i=0
  local net_array=()
  while IFS= read -r net; do
    i=$((i + 1))
    net_array+=("$net")
    # Show network with connected container count
    local connected
    connected=$(docker network inspect "$net" --format '{{len .Containers}}' 2>/dev/null || echo "0")
    echo -e "  ${WHITE_R}${i})${RESET} ${net} (${connected} containers)"
  done <<< "$networks"
  echo -e "  ${WHITE_R}$((i + 1)))${RESET} Create a new dedicated network for NOMAD"
  echo ""

  local net_choice=""
  while [[ -z "$net_choice" ]]; do
    read -rp "$(echo -e "${WHITE_R}#${RESET}") Select network [${i+1}]: " net_choice
    net_choice="${net_choice:-$((i + 1))}"

    if [[ "$net_choice" =~ ^[0-9]+$ ]] && [[ "$net_choice" -ge 1 ]] && [[ "$net_choice" -le $((i + 1)) ]]; then
      if [[ "$net_choice" -le "$i" ]]; then
        EXISTING_DOCKER_NETWORK="${net_array[$((net_choice - 1))]}"
        echo -e "${GREEN}#${RESET} NOMAD will join network: ${GREEN}${EXISTING_DOCKER_NETWORK}${RESET}\\n"
      else
        echo -e "${GREEN}#${RESET} NOMAD will create its own network.\\n"
      fi
    else
      echo -e "${RED}#${RESET} Invalid choice."; net_choice=""
    fi
  done
}

prompt_mysql_reuse() {
  local existing_mysql_name
  existing_mysql_name=$(docker ps --format '{{.Names}}\t{{.Image}}' 2>/dev/null | grep -i mysql | head -1 | cut -f1)

  if [[ -z "$existing_mysql_name" ]]; then
    echo -e "${GREEN}#${RESET} No existing MySQL found. NOMAD will create its own.\\n"
    return
  fi

  echo -e "${YELLOW}#${RESET} An existing MySQL container was found: ${WHITE_R}${existing_mysql_name}${RESET}"
  echo -e "  ${WHITE_R}1)${RESET} Use NOMAD's own MySQL (recommended — isolated, no risk to existing data)"
  echo -e "  ${WHITE_R}2)${RESET} Reuse ${existing_mysql_name} (saves resources, but NOMAD needs a database created)"
  echo ""

  local choice=""
  while [[ -z "$choice" ]]; do
    read -rp "$(echo -e "${WHITE_R}#${RESET}") MySQL preference [1]: " choice
    choice="${choice:-1}"
    case "$choice" in
      1)
        echo -e "${GREEN}#${RESET} NOMAD will use its own MySQL.\\n"
        ;;
      2)
        REUSE_MYSQL=true
        echo ""
        echo -e "${YELLOW}#${RESET} To reuse ${existing_mysql_name}, NOMAD needs database credentials."
        echo -e "  ${WHITE_R}NOMAD will create a database named 'nomad' if it doesn't exist.${RESET}\\n"

        # Detect connection info from the container
        local detected_network
        detected_network=$(docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$existing_mysql_name" 2>/dev/null | awk '{print $1}')

        EXTERNAL_MYSQL_HOST="$existing_mysql_name"
        if [[ -n "$detected_network" && -z "$EXISTING_DOCKER_NETWORK" ]]; then
          # Auto-join the MySQL container's network if user didn't pick one
          EXISTING_DOCKER_NETWORK="$detected_network"
          echo -e "${GREEN}#${RESET} Auto-joining network ${GREEN}${detected_network}${RESET} (same as MySQL container)"
        fi

        # Get port from container
        EXTERNAL_MYSQL_PORT=$(docker inspect --format '{{range $p, $conf := .Config.ExposedPorts}}{{$p}} {{end}}' "$existing_mysql_name" 2>/dev/null | grep -oP '\d+' | head -1)
        EXTERNAL_MYSQL_PORT="${EXTERNAL_MYSQL_PORT:-3306}"

        read -rp "$(echo -e "${WHITE_R}#${RESET}") MySQL user [root]: " EXTERNAL_MYSQL_USER
        EXTERNAL_MYSQL_USER="${EXTERNAL_MYSQL_USER:-root}"

        read -srp "$(echo -e "${WHITE_R}#${RESET}") MySQL password: " EXTERNAL_MYSQL_PASSWORD
        echo ""

        EXTERNAL_MYSQL_DATABASE="nomad"
        read -rp "$(echo -e "${WHITE_R}#${RESET}") Database name [nomad]: " user_db
        EXTERNAL_MYSQL_DATABASE="${user_db:-nomad}"

        echo -e "${GREEN}#${RESET} Will connect to MySQL at ${EXTERNAL_MYSQL_HOST}:${EXTERNAL_MYSQL_PORT}\\n"
        ;;
      *)
        echo -e "${RED}#${RESET} Invalid choice."; choice=""
        ;;
    esac
  done
}

prompt_redis_reuse() {
  local existing_redis_name
  existing_redis_name=$(docker ps --format '{{.Names}}\t{{.Image}}' 2>/dev/null | grep -i redis | head -1 | cut -f1)

  if [[ -z "$existing_redis_name" ]]; then
    echo -e "${GREEN}#${RESET} No existing Redis found. NOMAD will create its own.\\n"
    return
  fi

  echo -e "${YELLOW}#${RESET} An existing Redis container was found: ${WHITE_R}${existing_redis_name}${RESET}"
  echo -e "  ${WHITE_R}1)${RESET} Use NOMAD's own Redis (recommended — isolated)"
  echo -e "  ${WHITE_R}2)${RESET} Reuse ${existing_redis_name} (saves resources)"
  echo ""

  local choice=""
  while [[ -z "$choice" ]]; do
    read -rp "$(echo -e "${WHITE_R}#${RESET}") Redis preference [1]: " choice
    choice="${choice:-1}"
    case "$choice" in
      1)
        echo -e "${GREEN}#${RESET} NOMAD will use its own Redis.\\n"
        ;;
      2)
        REUSE_REDIS=true

        local detected_network
        detected_network=$(docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$existing_redis_name" 2>/dev/null | awk '{print $1}')

        EXTERNAL_REDIS_HOST="$existing_redis_name"
        if [[ -n "$detected_network" && -z "$EXISTING_DOCKER_NETWORK" ]]; then
          EXISTING_DOCKER_NETWORK="$detected_network"
          echo -e "${GREEN}#${RESET} Auto-joining network ${GREEN}${detected_network}${RESET} (same as Redis container)"
        fi

        EXTERNAL_REDIS_PORT=$(docker inspect --format '{{range $p, $conf := .Config.ExposedPorts}}{{$p}} {{end}}' "$existing_redis_name" 2>/dev/null | grep -oP '\d+' | head -1)
        EXTERNAL_REDIS_PORT="${EXTERNAL_REDIS_PORT:-6379}"

        echo -e "${GREEN}#${RESET} Will connect to Redis at ${EXTERNAL_REDIS_HOST}:${EXTERNAL_REDIS_PORT}\\n"
        ;;
      *)
        echo -e "${RED}#${RESET} Invalid choice."; choice=""
        ;;
    esac
  done
}

save_integration_config() {
  # Persist integration settings so helper scripts and updates know the mode
  local config_file="${NOMAD_DIR}/.integration"

  cat > "$config_file" <<EOF
# Project N.O.M.A.D. Integration Configuration
# Generated during installation — do not edit manually
INSTALL_MODE=${INSTALL_MODE}
EXISTING_DOCKER_NETWORK=${EXISTING_DOCKER_NETWORK}
REUSE_MYSQL=${REUSE_MYSQL}
REUSE_REDIS=${REUSE_REDIS}
EXTERNAL_MYSQL_HOST=${EXTERNAL_MYSQL_HOST}
EXTERNAL_REDIS_HOST=${EXTERNAL_REDIS_HOST}
DETECTED_NVIDIA_RUNTIME=${DETECTED_NVIDIA_RUNTIME}
EOF

  echo -e "${GREEN}#${RESET} Integration config saved to ${config_file}\\n"
}

generate_integrated_compose() {
  # Build a compose file tailored to the detected environment.
  # - Removes MySQL/Redis services if reusing external ones
  # - Adds external network configuration
  # - NVIDIA GPU sharing is handled at container creation time by the admin app,
  #   not in the compose file (the compose only runs the admin + infra services)

  local compose_file="${NOMAD_DIR}/compose.yml"

  # Start from the downloaded template (already has passwords/URLs applied)
  # Now apply integration transforms:

  # --- Remove MySQL service if reusing external ---
  if $REUSE_MYSQL; then
    echo -e "${YELLOW}#${RESET} Removing MySQL service from compose (using external)...\\n"

    # Remove the mysql service block (from "  mysql:" to the line before the next top-level service)
    # Use awk for reliable multi-line YAML block removal
    awk '
      /^  mysql:/ { skip=1; next }
      skip && /^  [a-z]/ { skip=0 }
      !skip { print }
    ' "$compose_file" > "${compose_file}.tmp" && mv "${compose_file}.tmp" "$compose_file"

    # Remove mysql from admin's depends_on block
    awk '
      /mysql:/ && prev ~ /depends_on/ { next }
      /mysql:/ && prev ~ /condition:/ { next }
      /condition: service_healthy/ && pending_mysql { pending_mysql=0; next }
      { if (/mysql:/) { pending_mysql=1; next } }
      { pending_mysql=0; print; prev=$0 }
    ' "$compose_file" > "${compose_file}.tmp" 2>/dev/null
    # Simpler approach: just remove the mysql depends_on lines
    sed -i '/^      mysql:/,/^        condition: service_healthy$/d' "$compose_file"

    # Point admin at external MySQL
    sed -i "s|DB_HOST=mysql|DB_HOST=${EXTERNAL_MYSQL_HOST}|g" "$compose_file"
    sed -i "s|DB_PORT=3306|DB_PORT=${EXTERNAL_MYSQL_PORT}|g" "$compose_file"
    sed -i "s|DB_USER=nomad_user|DB_USER=${EXTERNAL_MYSQL_USER}|g" "$compose_file"
    sed -i "s|DB_DATABASE=nomad|DB_DATABASE=${EXTERNAL_MYSQL_DATABASE}|g" "$compose_file"
    # Replace the generated password with the external one
    sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=${EXTERNAL_MYSQL_PASSWORD}|" "$compose_file"
    # Remove the MYSQL_ROOT_PASSWORD and MYSQL_PASSWORD lines (no longer relevant)
    rm -f "${compose_file}.tmp"
  fi

  # --- Remove Redis service if reusing external ---
  if $REUSE_REDIS; then
    echo -e "${YELLOW}#${RESET} Removing Redis service from compose (using external)...\\n"

    awk '
      /^  redis:/ { skip=1; next }
      skip && /^  [a-z]/ { skip=0 }
      !skip { print }
    ' "$compose_file" > "${compose_file}.tmp" && mv "${compose_file}.tmp" "$compose_file"

    # Remove redis from admin's depends_on block
    sed -i '/^      redis:/,/^        condition: service_healthy$/d' "$compose_file"

    # Point admin at external Redis
    sed -i "s|REDIS_HOST=redis|REDIS_HOST=${EXTERNAL_REDIS_HOST}|g" "$compose_file"
    sed -i "s|REDIS_PORT=6379|REDIS_PORT=${EXTERNAL_REDIS_PORT}|g" "$compose_file"
    rm -f "${compose_file}.tmp"
  fi

  # If both MySQL and Redis were removed, clean up the empty depends_on block
  if $REUSE_MYSQL && $REUSE_REDIS; then
    sed -i '/^    depends_on:$/d' "$compose_file"
  fi

  # --- Add external network if selected ---
  if [[ -n "$EXISTING_DOCKER_NETWORK" ]]; then
    echo -e "${YELLOW}#${RESET} Configuring shared Docker network: ${EXISTING_DOCKER_NETWORK}...\\n"

    # Add networks section declaring the external network
    # and a default network pointing to it so all services join automatically
    cat >> "$compose_file" <<EOF

networks:
  default:
    name: ${EXISTING_DOCKER_NETWORK}
    external: true
EOF
  fi

  echo -e "${GREEN}#${RESET} Compose file configured for integrated mode.\\n"
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
  if docker info 2>/dev/null | grep -q \"nvidia\"; then
    echo -e "${GREEN}✓${RESET} Docker NVIDIA runtime configured\\n"
  else
    echo -e "${YELLOW}○${RESET} Docker NVIDIA runtime not detected\\n"
  fi
  
  # Check for AMD GPU
  if command -v lspci &> /dev/null; then
    if lspci 2>/dev/null | grep -iE "amd|radeon" &> /dev/null; then
      echo -e "${YELLOW}○${RESET} AMD GPU detected (ROCm support not currently available)\\n"
    fi
  fi
  
  echo -e "${YELLOW}===========================================${RESET}\\n"
  
  # Summary
  if command -v nvidia-smi &> /dev/null && docker info 2>/dev/null | grep -q \"nvidia\"; then
    echo -e "${GREEN}#${RESET} GPU acceleration is properly configured! The AI Assistant will use your GPU.\\n"
  else
    echo -e "${YELLOW}#${RESET} GPU acceleration not detected. The AI Assistant will run in CPU-only mode.\\n"
    if command -v nvidia-smi &> /dev/null && ! docker info 2>/dev/null | grep -q \"nvidia\"; then
      echo -e "${YELLOW}#${RESET} Tip: Your GPU is detected but Docker runtime is not configured.\\n"
      echo -e "${YELLOW}#${RESET} Try restarting Docker: ${WHITE_R}sudo systemctl restart docker${RESET}\\n"
    fi
  fi
}

success_message() {
  echo -e "${GREEN}#${RESET} Project N.O.M.A.D installation completed successfully!\\n"
  echo -e "${GREEN}#${RESET} Installation files are located at /opt/project-nomad\\n\n"
  echo -e "${GREEN}#${RESET} Project N.O.M.A.D's Command Center should automatically start whenever your device reboots. However, if you need to start it manually, you can always do so by running: ${WHITE_R}${NOMAD_DIR}/start_nomad.sh${RESET}\\n"
  echo -e "${GREEN}#${RESET} You can now access the management interface at http://localhost:8080 or http://${local_ip_address}:8080\\n"

  if [[ "$INSTALL_MODE" == "integrated" ]]; then
    echo -e "${YELLOW}#${RESET} Integration Summary:\\n"
    if [[ -n "$EXISTING_DOCKER_NETWORK" ]]; then
      printf "  ${WHITE_R}%-20s${RESET} %s\\n" "Docker Network:" "${EXISTING_DOCKER_NETWORK}"
    fi
    if $REUSE_MYSQL; then
      printf "  ${WHITE_R}%-20s${RESET} %s\\n" "MySQL:" "Reusing ${EXTERNAL_MYSQL_HOST}"
    else
      printf "  ${WHITE_R}%-20s${RESET} %s\\n" "MySQL:" "NOMAD-managed (nomad_mysql)"
    fi
    if $REUSE_REDIS; then
      printf "  ${WHITE_R}%-20s${RESET} %s\\n" "Redis:" "Reusing ${EXTERNAL_REDIS_HOST}"
    else
      printf "  ${WHITE_R}%-20s${RESET} %s\\n" "Redis:" "NOMAD-managed (nomad_redis)"
    fi
    if $DETECTED_NVIDIA_RUNTIME; then
      printf "  ${WHITE_R}%-20s${RESET} %s\\n" "NVIDIA GPU:" "Shared (auto time-sharing with other containers)"
    fi
    echo ""
  fi

  echo -e "${GREEN}#${RESET} Thank you for supporting Project N.O.M.A.D!\\n"
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Main Script                                                                                           #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

# Pre-flight checks
check_is_debian_based
check_is_bash
check_has_sudo
ensure_dependencies_installed
check_is_debug_mode

# Main install
get_install_confirmation
accept_terms
ensure_docker_installed
setup_nvidia_container_toolkit
get_local_ip
detect_docker_environment
prompt_installation_mode
create_nomad_directory
download_wait_for_it_script
download_entrypoint_script
download_sidecar_files
download_helper_scripts
download_and_start_collect_disk_info_script
download_management_compose_file
if [[ "$INSTALL_MODE" == "integrated" ]]; then
  generate_integrated_compose
  save_integration_config
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
