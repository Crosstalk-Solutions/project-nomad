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
MANAGEMENT_COMPOSE_FILE_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/management_compose.yaml"
ENTRYPOINT_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/entrypoint.sh"
SIDECAR_UPDATER_DOCKERFILE_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/sidecar-updater/Dockerfile"
SIDECAR_UPDATER_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/sidecar-updater/update-watcher.sh"
START_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/start_nomad.sh"
STOP_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/stop_nomad.sh"
UPDATE_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/update_nomad.sh"
WAIT_FOR_IT_SCRIPT_URL="https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh"
COLLECT_DISK_INFO_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/collect_disk_info.sh"

script_option_debug='true'
accepted_terms='false'
local_ip_address=''

# Default host ports for compose services (may be remapped if conflicts detected)
NOMAD_PORT_ADMIN=8080
NOMAD_PORT_DOZZLE=9999
NOMAD_PORT_MYSQL=3306
NOMAD_PORT_REDIS=6379

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

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                              Port Conflict Detection & Resolution                                                                               #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

check_port_available() {
  # Returns 0 if the port is available, 1 if in use
  local port="$1"
  if command -v ss &> /dev/null; then
    if ss -tlnH "sport = :${port}" 2>/dev/null | grep -q ":${port}"; then
      return 1
    fi
  elif command -v netstat &> /dev/null; then
    if netstat -tln 2>/dev/null | grep -q ":${port} "; then
      return 1
    fi
  else
    # Fallback: try to bind the port briefly
    if (echo >/dev/tcp/127.0.0.1/"$port") 2>/dev/null; then
      return 1
    fi
  fi
  return 0
}

find_alternate_ports() {
  # Given a default port, returns up to 3 available alternatives
  # Strategy: try +10000, +20000, +30000, then scan nearby ranges
  local default_port="$1"
  local alternates=()
  local candidate

  for offset in 10000 20000 30000; do
    candidate=$((default_port + offset))
    if [[ $candidate -le 65535 ]] && check_port_available "$candidate"; then
      alternates+=("$candidate")
      if [[ ${#alternates[@]} -ge 3 ]]; then
        break
      fi
    fi
  done

  # If we still need more, scan upward from default+1000 in steps of 1000
  if [[ ${#alternates[@]} -lt 3 ]]; then
    for step in 1000 2000 5000 7000; do
      candidate=$((default_port + step))
      if [[ $candidate -le 65535 ]] && check_port_available "$candidate"; then
        # Don't add duplicates
        local is_dup=false
        for existing in "${alternates[@]}"; do
          if [[ "$existing" == "$candidate" ]]; then
            is_dup=true
            break
          fi
        done
        if ! $is_dup; then
          alternates+=("$candidate")
          if [[ ${#alternates[@]} -ge 3 ]]; then
            break
          fi
        fi
      fi
    done
  fi

  echo "${alternates[*]}"
}

get_port_process_info() {
  # Returns a human-readable description of what's using a port
  local port="$1"
  local info=""
  if command -v ss &> /dev/null; then
    info=$(ss -tlnp "sport = :${port}" 2>/dev/null | tail -n +2 | head -1 | sed -n 's/.*users:(("\([^"]*\)".*/\1/p')
  elif command -v netstat &> /dev/null; then
    info=$(netstat -tlnp 2>/dev/null | grep ":${port} " | head -1 | awk '{print $NF}')
  fi
  if [[ -n "$info" ]]; then
    echo "$info"
  else
    echo "unknown process"
  fi
}

resolve_port_conflicts() {
  echo -e "\n${YELLOW}#${RESET} Checking for port conflicts...\\n"

  # Define the ports to check: variable_name default_port service_label
  local port_defs=(
    "NOMAD_PORT_ADMIN:${NOMAD_PORT_ADMIN}:Command Center"
    "NOMAD_PORT_DOZZLE:${NOMAD_PORT_DOZZLE}:Dozzle (Log Viewer)"
    "NOMAD_PORT_MYSQL:${NOMAD_PORT_MYSQL}:MySQL"
    "NOMAD_PORT_REDIS:${NOMAD_PORT_REDIS}:Redis"
  )

  local has_conflicts=false

  for def in "${port_defs[@]}"; do
    IFS=':' read -r var_name default_port label <<< "$def"

    if ! check_port_available "$default_port"; then
      has_conflicts=true
      local process_info
      process_info=$(get_port_process_info "$default_port")

      echo -e "${YELLOW}#${RESET} Port ${RED}${default_port}${RESET} is already in use by ${WHITE_R}${process_info}${RESET} (needed for ${WHITE_R}${label}${RESET})"

      local alternates
      alternates=$(find_alternate_ports "$default_port")
      IFS=' ' read -ra alt_array <<< "$alternates"

      if [[ ${#alt_array[@]} -eq 0 ]]; then
        echo -e "${RED}#${RESET} Could not find any available alternate ports for ${label}."
        echo -e "${RED}#${RESET} Please free up port ${default_port} and try again."
        exit 1
      fi

      # Recommend the first alternate
      local recommended="${alt_array[0]}"
      local alt_display=""
      for i in "${!alt_array[@]}"; do
        if [[ $i -eq 0 ]]; then
          alt_display+="${GREEN}${alt_array[$i]}${RESET} (recommended)"
        else
          alt_display+=", ${alt_array[$i]}"
        fi
      done

      echo -e "${YELLOW}#${RESET} Available alternatives: ${alt_display}"
      echo ""

      local chosen_port=""
      while [[ -z "$chosen_port" ]]; do
        read -rp "$(echo -e "${WHITE_R}#${RESET}") Enter port for ${label} [${recommended}]: " user_input
        user_input="${user_input:-$recommended}"

        # Validate: must be a number between 1 and 65535
        if ! [[ "$user_input" =~ ^[0-9]+$ ]] || [[ "$user_input" -lt 1 ]] || [[ "$user_input" -gt 65535 ]]; then
          echo -e "${RED}#${RESET} Invalid port number. Must be between 1 and 65535."
          continue
        fi

        # Check if the chosen port is available (unless it's the same as one we're already reassigning)
        if [[ "$user_input" != "$default_port" ]] && ! check_port_available "$user_input"; then
          echo -e "${RED}#${RESET} Port ${user_input} is also in use. Please choose another."
          continue
        fi

        chosen_port="$user_input"
      done

      # Update the variable
      eval "${var_name}=${chosen_port}"
      echo -e "${GREEN}#${RESET} ${label} will use port ${GREEN}${chosen_port}${RESET}\\n"
    else
      echo -e "${GREEN}#${RESET} Port ${default_port} is available (${label})\\n"
    fi
  done

  if $has_conflicts; then
    echo -e "${GREEN}#${RESET} All port conflicts resolved.\\n"
  else
    echo -e "${GREEN}#${RESET} No port conflicts detected.\\n"
  fi
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

  # Apply port overrides if any were remapped during conflict resolution
  if [[ "$NOMAD_PORT_ADMIN" != "8080" ]]; then
    # Update host port binding (host:container — only change the host side)
    sed -i 's|"8080:8080"|"'"${NOMAD_PORT_ADMIN}"':8080"|g' "$compose_file_path"
    # Note: PORT=8080 env var stays unchanged — that's the container-internal port.
    # Update the URL to use the correct external port
    sed -i "s|URL=http://${local_ip_address}:8080|URL=http://${local_ip_address}:${NOMAD_PORT_ADMIN}|g" "$compose_file_path"
  fi

  if [[ "$NOMAD_PORT_DOZZLE" != "9999" ]]; then
    sed -i 's|"9999:8080"|"'"${NOMAD_PORT_DOZZLE}"':8080"|g' "$compose_file_path"
  fi

  if [[ "$NOMAD_PORT_MYSQL" != "3306" ]]; then
    sed -i 's|"3306:3306"|"'"${NOMAD_PORT_MYSQL}"':3306"|g' "$compose_file_path"
  fi

  if [[ "$NOMAD_PORT_REDIS" != "6379" ]]; then
    sed -i 's|"6379:6379"|"'"${NOMAD_PORT_REDIS}"':6379"|g' "$compose_file_path"
  fi
  
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
  echo -e "${GREEN}#${RESET} You can now access the management interface at http://localhost:${NOMAD_PORT_ADMIN} or http://${local_ip_address}:${NOMAD_PORT_ADMIN}\\n"

  # Show port map if any ports were remapped
  if [[ "$NOMAD_PORT_ADMIN" != "8080" || "$NOMAD_PORT_DOZZLE" != "9999" || "$NOMAD_PORT_MYSQL" != "3306" || "$NOMAD_PORT_REDIS" != "6379" ]]; then
    echo -e "${YELLOW}#${RESET} Custom port assignments:\\n"
    printf "  ${WHITE_R}%-25s${RESET} %s\\n" "Command Center:" "http://${local_ip_address}:${NOMAD_PORT_ADMIN}"
    printf "  ${WHITE_R}%-25s${RESET} %s\\n" "Dozzle (Log Viewer):" "http://${local_ip_address}:${NOMAD_PORT_DOZZLE}"
    printf "  ${WHITE_R}%-25s${RESET} %s\\n" "MySQL:" "port ${NOMAD_PORT_MYSQL}"
    printf "  ${WHITE_R}%-25s${RESET} %s\\n" "Redis:" "port ${NOMAD_PORT_REDIS}"
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
resolve_port_conflicts
create_nomad_directory
download_wait_for_it_script
download_entrypoint_script
download_sidecar_files
download_helper_scripts
download_and_start_collect_disk_info_script
download_management_compose_file
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
