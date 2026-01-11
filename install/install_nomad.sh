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
MANAGEMENT_COMPOSE_FILE_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/install/management_compose.yaml"
ENTRYPOINT_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/install/entrypoint.sh"
START_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/install/start_nomad.sh"
STOP_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/install/stop_nomad.sh"
UPDATE_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/install/update_nomad.sh"
WAIT_FOR_IT_SCRIPT_URL="https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh"
COLLECT_DISK_INFO_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/master/install/collect_disk_info.sh"

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

get_install_confirmation(){
  read -p "This script will install/update Project N.O.M.A.D. and its dependencies on your machine. Are you sure you want to continue? (y/n): " choice
  case "$choice" in
    y|Y )
      echo -e "${GREEN}#${RESET} User chose to continue with the installation."
      ;;
    n|N )
      echo -e "${RED}#${RESET} User chose not to continue with the installation."
      exit 0
      ;;
    * )
      echo "Invalid Response"
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
  echo "Copyright 2025 Crosstalk Solutions, LLC"
  printf "\n"
  echo "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:"
  printf "\n"
  echo "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software."
  printf "\n"
  echo "THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE."
  echo -e "\n\n"
  read -p "I have read and accept License Agreement & Terms of Use (y/n)? " choice
  case "$choice" in
    y|Y )
      accepted_terms='true'
      ;;
    n|N )
      echo "License Agreement & Terms of Use not accepted. Installation cannot continue."
      exit 1
      ;;
    * )
      echo "Invalid Response"
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
  if ! sudo docker compose -f "${NOMAD_DIR}/compose.yml" up -d; then
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

success_message() {
  echo -e "${GREEN}#${RESET} Project N.O.M.A.D installation completed successfully!\\n"
  echo -e "${GREEN}#${RESET} Installation files are located at /opt/project-nomad\\n\n"
  echo -e "${GREEN}#${RESET} Project N.O.M.A.D's Command Center should automatically start whenever your device reboots. However, if you need to start it manually, you can always do so by running: ${WHITE_R}${NOMAD_DIR}/start_nomad.sh${RESET}\\n"
  echo -e "${GREEN}#${RESET} You can now access the management interface at http://localhost:8080 or http://${local_ip_address}:8080\\n"
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
check_is_debug_mode

# Main install
get_install_confirmation
accept_terms
ensure_docker_installed
get_local_ip
create_nomad_directory
download_wait_for_it_script
download_entrypoint_script
download_helper_scripts
download_and_start_collect_disk_info_script
download_management_compose_file
start_management_containers
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
