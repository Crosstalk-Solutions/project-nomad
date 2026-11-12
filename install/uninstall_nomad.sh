#!/bin/bash

# Project NOMAD Uninstall Script

###################################################################################################################################################################################################

# Script                | Project NOMAD Uninstall Script
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

NOMAD_DIR="/opt/project-nomad"
MANAGEMENT_COMPOSE_FILE="${NOMAD_DIR}/compose.yml"

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                     Functions                                                                                                   #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

header_red() {
  if [[ "${script_option_debug}" != 'true' ]]; then clear; clear; fi
  echo -e "${RED}#########################################################################${RESET}\\n"
}

# Privilege prefix: empty when running as root (EUID==0), "sudo" otherwise.
# Keeps the scripts working on base systems without sudo (Arch base, Debian
# with a root password). When root, ${SUDO} expands to nothing so
# `${SUDO} cmd` runs the command directly; otherwise it adds sudo.
SUDO=""
if [[ "${EUID}" -ne 0 ]]; then
  SUDO="sudo"
fi

check_has_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    echo -e "${GREEN}#${RESET} Running as root; sudo not required.\\n"
  elif ${SUDO} -n true 2>/dev/null; then
    echo -e "${GREEN}#${RESET} User has sudo permissions.\\n"
  else
    echo "User does not have sudo permissions"
    header_red
    echo -e "${RED}#${RESET} This script requires sudo permissions to run. Please run the script with sudo.\\n"
    echo -e "${RED}#${RESET} For example: sudo bash $(basename "$0")"
    exit 1
  fi
}

check_current_directory(){
  if [ "$(pwd)" == "${NOMAD_DIR}" ]; then
    echo "Please run this script from a directory other than ${NOMAD_DIR}."
    exit 1
  fi
}

ensure_management_compose_file_exists(){
  if [ ! -f "${MANAGEMENT_COMPOSE_FILE}" ]; then
    echo "Unable to find the management Docker Compose file at ${MANAGEMENT_COMPOSE_FILE}. There may be a problem with your Project NOMAD installation."
    exit 1
  fi
}

# Returns 0 (true) when the caller wants non-interactive "yes to all" behavior.
# Used by CI and any automation that must run the scripts without a TTY.
_nomad_assume_yes() {
  case "${NOMAD_ASSUME_YES:-}" in
    1|true|TRUE|True|yes|YES|Yes|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

get_uninstall_confirmation(){
  if _nomad_assume_yes; then
    echo "NOMAD_ASSUME_YES set - continuing with the uninstallation."
    return 0
  fi
  read -p "This script will remove ALL Project NOMAD files and containers. THIS CANNOT BE UNDONE. Are you sure you want to continue? (y/n): " choice
  case "$choice" in
    y|Y )
      echo -e "User chose to continue with the uninstallation."
      ;;
    n|N )
      echo -e "User chose not to continue with the uninstallation."
      exit 0
      ;;
    * )
      echo "Invalid Response"
      echo "User chose not to continue with the uninstallation."
      exit 0
      ;;
  esac
}

ensure_docker_installed() {
    # CI escape hatch (Issue #14, AC3): in a non-privileged CI container the
    # docker CLI is present (installed by the install step) but there is no
    # daemon, and the uninstall test only needs to exercise the file/storage
    # cleanup path — so the CLI-presence gate is satisfied by the install step
    # and we don't hard-fail here.
    if [[ "${NOMAD_CI_MODE:-0}" == "1" ]]; then
        echo "NOMAD_CI_MODE=1 — skipping Docker CLI presence gate (CI container)."
        return 0
    fi
    if ! command -v docker &> /dev/null; then
        echo "Unable to find Docker. There may be a problem with your Docker installation."
        exit 1
    fi
}

check_docker_compose() {
  # CI escape hatch (Issue #14, AC3): the compose v2 plugin is not present in
  # minimal distro base images, and `docker compose version` probes the daemon.
  # Uninstall only needs to exercise the file/storage cleanup path — the
  # compose v2 CLI is not required for that — so skip the gate in CI.
  if [[ "${NOMAD_CI_MODE:-0}" == "1" ]]; then
    echo -e "${YELLOW}#${RESET} NOMAD_CI_MODE=1 — skipping 'docker compose' plugin check (CI container).\\n"
    return 0
  fi
  # Check if 'docker compose' (v2 plugin) is available
  if ! docker compose version &>/dev/null; then
    echo -e "${RED}#${RESET} Docker Compose v2 is not installed or not available as a Docker plugin."
    echo -e "${YELLOW}#${RESET} This script requires 'docker compose' (v2), not 'docker-compose' (v1)."
    echo -e "${YELLOW}#${RESET} Please read the Docker documentation at https://docs.docker.com/compose/install/ for instructions on how to install Docker Compose v2."
    exit 1
  fi
}

storage_cleanup() {
  if _nomad_assume_yes; then
    echo "NOMAD_ASSUME_YES set - deleting the Project NOMAD storage directory (${NOMAD_DIR})."
    delete_dir_choice='y'
  else
    read -p "Do you want to delete the Project NOMAD storage directory (${NOMAD_DIR})? This is best if you want to start a completely fresh install. This will PERMANENTLY DELETE all stored NOMAD data and can't be undone! (y/N): " delete_dir_choice
  fi
  case "$delete_dir_choice" in
      y|Y )
          echo "Removing Project NOMAD files..."
          if rm -rf "${NOMAD_DIR}"; then
              echo "Project NOMAD files removed."
          else
              echo "Warning: Failed to fully remove ${NOMAD_DIR}. You may need to remove it manually."
          fi
          ;;
      * )
          echo "Skipping removal of ${NOMAD_DIR}."
          ;;
  esac
}

uninstall_nomad() {
    if [[ "${NOMAD_CI_MODE:-0}" == "1" ]]; then
        echo "NOMAD_CI_MODE=1 — skipping daemon-dependent container/network/volume cleanup (CI container, no daemon)."
        storage_cleanup
        echo "Project NOMAD has been uninstalled. We hope to see you again soon!"
        return 0
    fi
    echo "Stopping and removing Project NOMAD management containers..."
    docker compose -p project-nomad -f "${MANAGEMENT_COMPOSE_FILE}" down
    echo "Allowing some time for management containers to stop..."
    sleep 5


    # Stop and remove all containers where name starts with "nomad_"
    echo "Stopping and removing all Project NOMAD app containers..."
    docker ps -a --filter "name=^nomad_" --format "{{.Names}}" | xargs -r docker rm -f
    echo "Allowing some time for app containers to stop..."
    sleep 5

    echo "Containers should be stopped now."

    # Remove the shared Docker network (may still exist if app containers were using it during compose down)
    echo "Removing project-nomad_default network if it exists..."
    docker network rm project-nomad_default 2>/dev/null && echo "Network removed." || echo "Network already removed or not found."

    # Remove the shared update volume
    echo "Removing project-nomad_nomad-update-shared volume if it exists..."
    docker volume rm project-nomad_nomad-update-shared 2>/dev/null && echo "Volume removed." || echo "Volume already removed or not found."

    # Prompt user for storage cleanup and handle it if so
    storage_cleanup

    echo "Project NOMAD has been uninstalled. We hope to see you again soon!"
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                       Main                                                                                                      #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################
# ---------------------------------------------------------------------------#
# Sourcing guard (AC2)
#
# When this file is sourced (e.g. for unit-testing its functions in isolation),
# only define the functions and skip the main flow. Direct execution is
# detected via BASH_SOURCE. NOMAD_INSTALL_SOURCING=1 additionally forces
# "sourcing" mode, skipping the main block even if the file is being executed.
# ---------------------------------------------------------------------------#
if [[ "${BASH_SOURCE[0]}" == "${0}" && -z "${NOMAD_INSTALL_SOURCING:-}" ]]; then
check_has_sudo
check_current_directory
ensure_management_compose_file_exists
ensure_docker_installed
check_docker_compose
get_uninstall_confirmation
uninstall_nomad
fi  # sourcing guard