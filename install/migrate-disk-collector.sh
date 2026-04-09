#!/bin/bash

# Project N.O.M.A.D. — Disk Collector Migration Script
#
# Script                | Project N.O.M.A.D. Disk Collector Migration Script
# Version               | 1.0.0
# Author                | Crosstalk Solutions, LLC
# Website               | https://crosstalksolutions.com
#
# PURPOSE:
#   One-time migration from the host-based disk info collector to the
#   disk-collector Docker sidecar. The old approach used a nohup background
#   process that wrote to /tmp/nomad-disk-info.json, which was bind-mounted
#   into the admin container. This broke on host reboots because /tmp is
#   cleared and Docker would create a directory at the mount point instead of a file.
#
#   The new approach uses a disk-collector sidecar container that reads host
#   disk info via the /:/host:ro,rslave bind-mount pattern (same pattern as Prometheus
#   node-exporter, and no SYS_ADMIN or privileged capabilities required) and writes directly to
#   /opt/project-nomad/storage/nomad-disk-info.json, which the admin container
#   already reads via its existing storage bind-mount. Thus, no admin image update
#   or new volume mounts required.

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

# Load install location from config saved by installer, fallback to default
if [[ -f /etc/project-nomad.conf ]]; then
  source /etc/project-nomad.conf
fi
NOMAD_DIR="${NOMAD_DIR:-/opt/project-nomad}"
COMPOSE_FILE="${NOMAD_DIR}/compose.yml"
COMPOSE_PROJECT_NAME="project-nomad"

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

check_has_sudo() {
  if sudo -n true 2>/dev/null; then
    echo -e "${GREEN}#${RESET} Sudo permissions confirmed.\n"
  else
    echo -e "${RED}#${RESET} This script requires sudo permissions."
    echo -e "${RED}#${RESET} Example: sudo bash $(basename "$0")"
    exit 1
  fi
}

check_confirmation() {
  echo -e "${YELLOW}#${RESET} This script migrates your Project N.O.M.A.D. installation from the"
  echo -e "${YELLOW}#${RESET} host-based disk info collector to the new disk-collector sidecar."
  echo -e "${YELLOW}#${RESET} It will modify compose.yml and restart the full compose stack"
  echo -e "${YELLOW}#${RESET} to drop the old /tmp bind mount and start the disk-collector sidecar."
  echo -e "${YELLOW}#${RESET} Please ensure you have a backup of your data before proceeding.\n"

  echo -e "${RED}#${RESET} STOP: If you have customized your compose.yml or Nomad's storage setup (not common), please make these changes manually instead of using this script!\n"
  read -rp "Do you want to continue? (y/N) " response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo -e "${RED}#${RESET} Aborting. No changes have been made."
    exit 0
  fi
  echo -e "${GREEN}#${RESET} Confirmation received. Proceeding with migration...\n"
}

check_docker_running() {
  if ! command -v docker &>/dev/null; then
    echo -e "${RED}#${RESET} Docker is not installed. Cannot proceed."
    exit 1
  fi
  if ! systemctl is-active --quiet docker; then
    echo -e "${RED}#${RESET} Docker is not running. Please start Docker and try again."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Docker is running.\n"
}

check_compose_file() {
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo -e "${RED}#${RESET} compose.yml not found at ${COMPOSE_FILE}."
    echo -e "${RED}#${RESET} Project N.O.M.A.D. does not appear to be installed or compose.yml is missing."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Found compose.yml at ${COMPOSE_FILE}.\n"
}

# Step 1: Stop old host process
stop_old_host_process() {
  local pid_file="${NOMAD_DIR}/nomad-collect-disk-info.pid"

  if [[ -f "$pid_file" ]]; then
    echo -e "${YELLOW}#${RESET} Stopping old collect-disk-info background process..."
    local pid
    pid=$(cat "$pid_file")
    if kill "$pid" 2>/dev/null; then
      echo -e "${GREEN}#${RESET} Process ${pid} stopped.\n"
    else
      echo -e "${YELLOW}#${RESET} Process ${pid} was not running (already stopped).\n"
    fi
    rm -f "$pid_file"
  else
    echo -e "${GREEN}#${RESET} No old collect-disk-info PID file found — nothing to stop.\n"
  fi
}

# Step 2: Backup compose.yml
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

# Step 3: Remove old bind-mount from admin volumes
remove_old_bind_mount() {
  if ! grep -q 'nomad-disk-info\.json' "$COMPOSE_FILE"; then
    echo -e "${GREEN}#${RESET} Old /tmp/nomad-disk-info.json bind-mount not found — already removed.\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Removing old /tmp/nomad-disk-info.json bind-mount from admin volumes..."
  sed -i '/\/tmp\/nomad-disk-info\.json:\/app\/storage\/nomad-disk-info\.json/d' "$COMPOSE_FILE"

  if grep -q 'nomad-disk-info\.json' "$COMPOSE_FILE"; then
    echo -e "${RED}#${RESET} Failed to remove old bind-mount from compose.yml. Please remove it manually:"
    echo -e "${WHITE_R}      - /tmp/nomad-disk-info.json:/app/storage/nomad-disk-info.json${RESET}"
    exit 1
  fi

  echo -e "${GREEN}#${RESET} Old bind-mount removed.\n"
}

# Step 4: Add disk-collector service block
add_disk_collector_service() {
  if grep -q 'disk-collector:' "$COMPOSE_FILE"; then
    echo -e "${GREEN}#${RESET} disk-collector service already present in compose.yml — skipping.\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Adding disk-collector service to compose.yml..."

  # Insert the disk-collector service block before the top-level `volumes:` key
  awk -v nomad_dir="$NOMAD_DIR" '/^volumes:/{
    print "  disk-collector:"
    print "    image: ghcr.io/crosstalk-solutions/project-nomad-disk-collector:latest"
    print "    pull_policy: always"
    print "    container_name: nomad_disk_collector"
    print "    restart: unless-stopped"
    print "    volumes:"
    print "      - /:/host:ro,rslave  # Read-only view of host FS with rslave propagation so /sys and /proc submounts are visible"
    print "      - " nomad_dir "/storage:/storage  # Shared storage dir — disk info written here is read by the admin container"
    print ""
  }
  {print}' "$COMPOSE_FILE" > "${COMPOSE_FILE}.tmp" && mv "${COMPOSE_FILE}.tmp" "$COMPOSE_FILE"

  if ! grep -q 'disk-collector:' "$COMPOSE_FILE"; then
    echo -e "${RED}#${RESET} Failed to add disk-collector service. Please add it manually before the top-level volumes: key."
    exit 1
  fi

  echo -e "${GREEN}#${RESET} disk-collector service added.\n"
}

# Step 5 — Pull new image and restart the full stack
# This will re-create the admin container and drop the old /tmp bind, and
# also starts the new disk-collector sidecar we just added to compose.yml
restart_stack() {
  echo -e "${YELLOW}#${RESET} Pulling latest images (including disk-collector)..."
  if ! docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" pull; then
    echo -e "${RED}#${RESET} Failed to pull images. Check your network connection."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Images pulled.\n"

  echo -e "${YELLOW}#${RESET} Restarting stack..."
  if ! docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" up -d; then
    echo -e "${RED}#${RESET} Failed to bring the stack up."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Stack restarted.\n"
}

# Step 6: Verify
verify_disk_collector_running() {
  sleep 3
  if docker ps --filter "name=^nomad_disk_collector$" --filter "status=running" --format '{{.Names}}' | grep -qx "nomad_disk_collector"; then
    echo -e "${GREEN}#${RESET} disk-collector container is running.\n"
  else
    echo -e "${RED}#${RESET} disk-collector container does not appear to be running."
    echo -e "${RED}#${RESET} Check its logs with: docker logs nomad_disk_collector"
    exit 1
  fi
}

# Main
echo -e "${GREEN}#########################################################################${RESET}"
echo -e "${GREEN}#${RESET}      Project N.O.M.A.D. — Disk Collector Migration Script             ${GREEN}#${RESET}"
echo -e "${GREEN}#########################################################################${RESET}\n"

check_is_bash
check_has_sudo
check_confirmation
check_docker_running
check_compose_file

echo -e "${YELLOW}#${RESET} Step 1: Stopping old host process...\n"
stop_old_host_process

echo -e "${YELLOW}#${RESET} Step 2: Backing up compose.yml...\n"
backup_compose_file

echo -e "${YELLOW}#${RESET} Step 3: Removing old bind-mount...\n"
remove_old_bind_mount

echo -e "${YELLOW}#${RESET} Step 4: Adding disk-collector service...\n"
add_disk_collector_service

echo -e "${YELLOW}#${RESET} Step 5: Pulling images and restarting stack...\n"
restart_stack

echo -e "${YELLOW}#${RESET} Step 6: Verifying disk-collector is running...\n"
verify_disk_collector_running

echo -e "${GREEN}#########################################################################${RESET}"
echo -e "${GREEN}#${RESET} Migration completed successfully!"
echo -e "${GREEN}#${RESET}"
echo -e "${GREEN}#${RESET} The disk-collector sidecar is now running and will update disk info"
echo -e "${GREEN}#${RESET} every 2 minutes. The /api/system/info endpoint will return disk data"
echo -e "${GREEN}#${RESET} after the first collector write (~5 seconds after startup)."
echo -e "${GREEN}#${RESET}"
echo -e "${GREEN}#########################################################################${RESET}\n"
