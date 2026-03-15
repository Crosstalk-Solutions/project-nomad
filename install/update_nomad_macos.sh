#!/bin/bash

# Project N.O.M.A.D. Update Script (macOS)

RESET='\033[0m'
YELLOW='\033[1;33m'
WHITE_R='\033[39m'
RED='\033[1;31m'
GREEN='\033[1;32m'

NOMAD_DIR="$HOME/project-nomad-data"
REPO_DIR="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)"

check_is_bash() {
  if [[ -z "$BASH_VERSION" ]]; then
    echo -e "${RED}#${RESET} This script requires bash to run."
    exit 1
  fi
}

check_is_macos() {
  if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "${RED}#${RESET} This script is designed for macOS. Use update_nomad.sh for Linux."
    exit 1
  fi
}

get_update_confirmation() {
  read -p "This script will update Project N.O.M.A.D. No data loss is expected, but you should always back up your data before proceeding. Continue? (y/N): " choice
  case "$choice" in
    y|Y ) echo -e "${GREEN}#${RESET} Proceeding with update." ;;
    * ) echo "Update cancelled."; exit 0 ;;
  esac
}

ensure_docker_running() {
  if ! command -v docker &> /dev/null; then
    echo -e "${RED}#${RESET} Docker is not installed."
    exit 1
  fi
  if ! docker info &> /dev/null; then
    echo -e "${YELLOW}#${RESET} Docker Desktop is not running. Starting it..."
    open -a Docker
    local retries=30
    while ! docker info &> /dev/null && [[ $retries -gt 0 ]]; do
      sleep 2
      retries=$((retries - 1))
    done
    if ! docker info &> /dev/null; then
      echo -e "${RED}#${RESET} Docker Desktop did not start. Please start it manually."
      exit 1
    fi
  fi
}

ensure_compose_file_exists() {
  if [[ ! -f "${NOMAD_DIR}/compose.yml" ]]; then
    echo -e "${RED}#${RESET} compose.yml not found at ${NOMAD_DIR}/compose.yml. Did you run the install script first?"
    exit 1
  fi
}

rebuild_and_update() {
  # Pull latest code
  if [[ -d "$REPO_DIR/.git" ]]; then
    echo -e "${YELLOW}#${RESET} Pulling latest code from git..."
    git -C "$REPO_DIR" pull || echo -e "${YELLOW}#${RESET} Git pull failed, continuing with current code..."
  fi

  # Rebuild the admin image
  echo -e "${YELLOW}#${RESET} Rebuilding admin image for $(uname -m)..."
  if ! docker build -t project-nomad-admin:latest -f "${REPO_DIR}/Dockerfile" "${REPO_DIR}"; then
    echo -e "${RED}#${RESET} Failed to rebuild admin image."
    exit 1
  fi

  # Pull latest versions of third-party images
  echo -e "${YELLOW}#${RESET} Pulling latest third-party images..."
  docker compose -p project-nomad -f "${NOMAD_DIR}/compose.yml" pull --ignore-buildable 2>/dev/null || true

  # Recreate containers
  echo -e "${YELLOW}#${RESET} Recreating containers..."
  if ! docker compose -p project-nomad -f "${NOMAD_DIR}/compose.yml" up -d --force-recreate; then
    echo -e "${RED}#${RESET} Failed to recreate containers."
    exit 1
  fi
}

get_local_ip() {
  local_ip_address=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
}

success_message() {
  echo -e "${GREEN}#${RESET} Project N.O.M.A.D update completed successfully!\\n"
  echo -e "${GREEN}#${RESET} Access the management interface at http://localhost:8080 or http://${local_ip_address}:8080\\n"
}

# Main
check_is_macos
check_is_bash
get_update_confirmation
ensure_docker_running
ensure_compose_file_exists
rebuild_and_update
get_local_ip
success_message
