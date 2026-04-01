#!/bin/bash

# Project N.O.M.A.D. - One-Time Updater Fix Script
#
# Script                | Project N.O.M.A.D. One-Time Updater Fix Script
# Version               | 1.0.0
# Author                | Crosstalk Solutions, LLC
# Website               | https://crosstalksolutions.com
#
# PURPOSE:
#   This is a one-time migration script. It deploys two fixes to the sidecar
#   updater that cannot be applied through the normal in-app update mechanism:
#
#   Fix 1 — Sidecar volume write access
#     Removes the :ro (read-only) flag from the sidecar's /opt/project-nomad
#     volume mount in compose.yml. The sidecar must be able to write to
#     compose.yml so it can set the correct Docker image tag when installing
#     RC or stable versions.
#
#   Fix 2 — RC-aware sidecar watcher
#     Downloads the updated sidecar Dockerfile (adds jq) and update-watcher.sh
#     (reads target_tag from the update request and applies it to compose.yml
#     before pulling images), then rebuilds and restarts the sidecar container.
#
#   NOTE: The companion fix in the admin service (system_update_service.ts,
#   which writes the target_tag into the update request) ships in the GHCR
#   image and will take effect automatically on the next normal app update.

###############################################################################
# Color Codes
###############################################################################

RESET='\033[0m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
GREEN='\033[1;32m'
WHITE_R='\033[39m'

###############################################################################
# Constants
###############################################################################

NOMAD_DIR="${NOMAD_DIR:-/opt/project-nomad}"
COMPOSE_FILE="${NOMAD_DIR}/compose.yml"
SIDECAR_DIR="${NOMAD_DIR}/sidecar-updater"
COMPOSE_PROJECT_NAME="project-nomad"

SIDECAR_DOCKERFILE_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/sidecar-updater/Dockerfile"
SIDECAR_SCRIPT_URL="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/sidecar-updater/update-watcher.sh"

###############################################################################
# Pre-flight Checks
###############################################################################

check_is_bash() {
  if [[ -z "$BASH_VERSION" ]]; then
    echo -e "${RED}#${RESET} This script must be run with bash."
    echo -e "${RED}#${RESET} Example: bash $(basename "$0")"
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Running in bash.\n"
}

check_confirmation() {
  echo -e "${YELLOW}#${RESET} This is a very specific fix script for a very specific issue. You probably don't need to run this unless you were specifically directed to by the N.O.M.A.D. team."
  echo -e "${YELLOW}#${RESET} Please ensure you have a backup of your data before proceeding."
  read -rp "Do you want to continue? (y/N) " response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo -e "${RED}#${RESET} Aborting. No changes have been made."
    exit 0
  fi
  echo -e "${GREEN}#${RESET} Confirmation received. Proceeding with fixes...\n"
}

check_has_sudo() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo -e "${GREEN}#${RESET} macOS path does not require sudo by default.\n"
    return 0
  fi

  if sudo -n true 2>/dev/null; then
    echo -e "${GREEN}#${RESET} Sudo permissions confirmed.\n"
  else
    echo -e "${RED}#${RESET} This script requires sudo permissions."
    echo -e "${RED}#${RESET} Example: sudo bash $(basename "$0")"
    exit 1
  fi
}

check_docker_running() {
  if ! command -v docker &>/dev/null; then
    echo -e "${RED}#${RESET} Docker is not installed. Cannot proceed."
    exit 1
  fi
  if ! docker info &>/dev/null; then
    echo -e "${RED}#${RESET} Docker is not running. Please start Docker and try again."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Docker is running.\n"
}

check_compose_file() {
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo -e "${RED}#${RESET} compose.yml not found at ${COMPOSE_FILE}."
    echo -e "${RED}#${RESET} Please ensure Project N.O.M.A.D. is installed before running this script."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Found compose.yml at ${COMPOSE_FILE}.\n"
}

check_sidecar_dir() {
  if [[ ! -d "$SIDECAR_DIR" ]]; then
    echo -e "${RED}#${RESET} Sidecar directory not found at ${SIDECAR_DIR}."
    echo -e "${RED}#${RESET} Please ensure Project N.O.M.A.D. is installed before running this script."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Found sidecar directory at ${SIDECAR_DIR}.\n"
}

###############################################################################
# Fix 1 — Remove :ro from sidecar volume mount
###############################################################################

backup_compose_file() {
  local backup="${COMPOSE_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  echo -e "${YELLOW}#${RESET} Backing up compose.yml to ${backup}..."
  if cp "$COMPOSE_FILE" "$backup"; then
    echo -e "${GREEN}#${RESET} Backup created at ${backup}.\n"
  else
    echo -e "${RED}#${RESET} Failed to create backup. Aborting."
    exit 1
  fi
}

fix_sidecar_volume_mount() {
  local readonly_mount="${NOMAD_DIR}:${NOMAD_DIR}:ro"
  local writable_mount="${NOMAD_DIR}:${NOMAD_DIR}"

  # Idempotent: skip if :ro is already absent from the sidecar mount line
  if ! grep -q "$readonly_mount" "$COMPOSE_FILE"; then
    echo -e "${GREEN}#${RESET} Sidecar volume mount is already writable — no change needed.\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Removing :ro restriction from sidecar volume mount in compose.yml..."
  perl -0pi -e "s|\\Q${readonly_mount}\\E.*|${writable_mount} # Writable access required so the updater can set the correct image tag in compose.yml|g" "$COMPOSE_FILE"

  if grep -q "$readonly_mount" "$COMPOSE_FILE"; then
    echo -e "${RED}#${RESET} Failed to remove :ro from compose.yml. Please update it manually:"
    echo -e "${WHITE_R}    - ${readonly_mount}${RESET}  →  ${WHITE_R}- ${writable_mount}${RESET}"
    exit 1
  fi

  echo -e "${GREEN}#${RESET} Sidecar volume mount updated successfully.\n"
}

###############################################################################
# Fix 2 — Download updated sidecar files and rebuild
###############################################################################

download_updated_sidecar_files() {
  echo -e "${YELLOW}#${RESET} Downloading updated sidecar Dockerfile..."
  if ! curl -fsSL "$SIDECAR_DOCKERFILE_URL" -o "${SIDECAR_DIR}/Dockerfile"; then
    echo -e "${RED}#${RESET} Failed to download sidecar Dockerfile. Check your network connection."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Sidecar Dockerfile updated.\n"

  echo -e "${YELLOW}#${RESET} Downloading updated update-watcher.sh..."
  if ! curl -fsSL "$SIDECAR_SCRIPT_URL" -o "${SIDECAR_DIR}/update-watcher.sh"; then
    echo -e "${RED}#${RESET} Failed to download update-watcher.sh. Check your network connection."
    exit 1
  fi
  chmod +x "${SIDECAR_DIR}/update-watcher.sh"
  echo -e "${GREEN}#${RESET} update-watcher.sh updated.\n"
}

rebuild_sidecar() {
  echo -e "${YELLOW}#${RESET} Rebuilding the updater container (this may take a moment)..."
  if ! docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" build updater; then
    echo -e "${RED}#${RESET} Failed to rebuild the updater container. See output above for details."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Updater container rebuilt successfully.\n"
}

restart_sidecar() {
  echo -e "${YELLOW}#${RESET} Stopping and removing existing updater containers..."

  # Stop and remove via compose first (handles the compose-tracked container)
  docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" stop updater >> /dev/null 2>&1 || true
  docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" rm -f updater >> /dev/null 2>&1 || true

  # Force-remove any stale container still holding the name (e.g. hash-prefixed remnants)
  docker rm -f nomad_updater >> /dev/null 2>&1 || true

  echo -e "${YELLOW}#${RESET} Starting the updated updater container..."
  if ! docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" up -d updater; then
    echo -e "${RED}#${RESET} Failed to start the updater container."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Updater container started.\n"
}

verify_sidecar_running() {
  sleep 3
  # Use exact name match to avoid false positives from hash-prefixed stale containers
  if docker ps --filter "name=^nomad_updater$" --filter "status=running" --format '{{.Names}}' | grep -qx "nomad_updater"; then
    echo -e "${GREEN}#${RESET} Updater container is running.\n"
  else
    echo -e "${RED}#${RESET} Updater container does not appear to be running."
    echo -e "${RED}#${RESET} Check its logs with: docker logs nomad_updater"
    exit 1
  fi
}

###############################################################################
# Main
###############################################################################

echo -e "${GREEN}#########################################################################${RESET}"
echo -e "${GREEN}#${RESET}         Project N.O.M.A.D. — One-Time Updater Fix Script               ${GREEN}#${RESET}"
echo -e "${GREEN}#########################################################################${RESET}\n"

check_is_bash
check_has_sudo
check_confirmation
check_docker_running
check_compose_file
check_sidecar_dir

echo -e "${YELLOW}#${RESET} Starting Fix 1: Sidecar volume write access...\n"
backup_compose_file
fix_sidecar_volume_mount

echo -e "${YELLOW}#${RESET} Starting Fix 2: RC-aware sidecar watcher...\n"
download_updated_sidecar_files
rebuild_sidecar
restart_sidecar
verify_sidecar_running

echo -e "${GREEN}#########################################################################${RESET}"
echo -e "${GREEN}#${RESET} All fixes applied successfully!"
echo -e "${GREEN}#${RESET}"
echo -e "${GREEN}#${RESET} The updater sidecar can now install RC and stable versions correctly."
echo -e "${GREEN}#${RESET} The remaining fix (admin service target_tag support) will apply"
echo -e "${GREEN}#${RESET} automatically the next time you update N.O.M.A.D. via the UI."
echo -e "${GREEN}#########################################################################${RESET}\n"
