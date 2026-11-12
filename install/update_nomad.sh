#!/bin/bash

# Project NOMAD Update Script

###################################################################################################################################################################################################

# Script                | Project NOMAD Update Script
# Version               | 1.0.1
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
#                                                                                          Constants & Variables                                                                                     #
#                                                                                                                                                                                                 #
###################################################################################################################################

NOMAD_DIR="/opt/project-nomad"

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Functions                                                                                             #
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

check_is_bash() {
  if [[ -z "$BASH_VERSION" ]]; then
    header_red
    echo -e "${RED}#${RESET} This script requires bash to run. Please run the script using bash.\\n"
    echo -e "${RED}#${RESET} For example: bash $(basename "$0")"
    exit 1
  fi
    echo -e "${GREEN}#${RESET} This script is running in bash.\\n"
}

# ---------------------------------------------------------------------------
# Multi-distro package dispatch (Debian / RHEL / Arch). Mirrors install_nomad.sh
# so an install on Arch/RHEL is not undone by an update on the same host.
# Upstream: project-nomad issue #1, PR #243, and issue #1381.
PKG_FAMILY=''

detect_pkg_family() {
  local os_ids=''
  if [[ -r /etc/os-release ]]; then
    os_ids="$(sed -nE 's/^(ID|ID_LIKE)=//p' /etc/os-release 2>/dev/null | sed 's/"//g' | tr '\n' ' ')"
  fi
  if command -v apt-get &> /dev/null; then
    PKG_FAMILY='debian'
  elif command -v dnf &> /dev/null; then
    PKG_FAMILY='rhel'
  elif command -v pacman &> /dev/null; then
    PKG_FAMILY='arch'
  else
    if printf '%s' "${os_ids}" | grep -qiE 'debian|ubuntu'; then
      PKG_FAMILY='debian'
    elif printf '%s' "${os_ids}" | grep -qiE 'fedora|rhel|centos'; then
      PKG_FAMILY='rhel'
    elif printf '%s' "${os_ids}" | grep -qiE 'arch|manjaro|endeavour'; then
      PKG_FAMILY='arch'
    fi
  fi
}

# Resolve the first usable IPv4: non-loopback and off the Docker / link-local
# subnets. Tries hostname -I, then `ip -4 -o addr show`, then ifconfig, then a
# python3 socket fallback. Upstream: issue #2 (hostname -I unavailable on Arch).
resolve_local_ip() {
  local -a ips=()
  local -a tmp=()

  if command -v hostname &> /dev/null; then
    # hostname -I prints all addresses space-separated on ONE line; split on
    # whitespace (mapfile reads lines and would yield a single multi-IP token
    # that fails the single-IPv4 match below).
    read -ra tmp <<< "$(hostname -I 2>/dev/null)"
    ips+=("${tmp[@]}")
    tmp=()
  fi

  if command -v ip &> /dev/null; then
    mapfile -t tmp < <(ip -4 -o addr show 2>/dev/null | awk '$3=="inet"{print $4}' | cut -d/ -f1)
    ips+=("${tmp[@]}")
    tmp=()
  fi

  if command -v ifconfig &> /dev/null; then
    mapfile -t tmp < <(ifconfig 2>/dev/null | awk '$1 ~ /^inet/{print $2}' | sed 's/^addr://')
    ips+=("${tmp[@]}")
    tmp=()
  fi

  # Last resort: read the kernel's IPv4 routing trie directly. This needs no
  # userspace tool at all (no hostname/ip/ifconfig/python3) and is present on
  # every Linux. Structure: the address is on the line BEFORE '/32 host':
  #        |-- 10.10.100.13
  #           /32 host LOCAL
  if [[ -r /proc/net/fib_trie ]]; then
    mapfile -t tmp < <(awk '
      $0 ~ /\/32 host/ {
        ip=prev
        sub(/^.*-- */, "", ip)
        if (ip ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) print ip
      }
      { prev=$0 }
    ' /proc/net/fib_trie 2>/dev/null)
    ips+=("${tmp[@]}")
    tmp=()
  fi

  local ip
  local fallback_ip=''
  local _is_ipv4_re='^[0-9]{1,3}(\.[0-9]{1,3}){3}$'
  for ip in "${ips[@]}"; do
    [[ -z "${ip}" ]] && continue
    if [[ ! "${ip}" =~ ${_is_ipv4_re} ]]; then continue; fi
    case "${ip}" in
      127.0.0.*|169.254.*) continue ;;
      172.17.*|172.18.*|172.19.*)
        [[ -z "${fallback_ip}" ]] && fallback_ip="${ip}"
        continue ;;
      *)
        printf '%s\n' "${ip}"
        return 0 ;;
    esac
  done

  if [[ -n "${fallback_ip}" ]]; then
    printf '%s\n' "${fallback_ip}"
    return 0
  fi

  if command -v python3 &> /dev/null; then
    local py_ip=''
    py_ip="$(python3 -c 'import socket; s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("8.8.8.8", 80)); print(s.getsockname()[0]); s.close()' 2>/dev/null)"
    if [[ -n "${py_ip}" ]]; then
      case "${py_ip}" in
        127.0.0.*|169.254.*|172.17.*) : ;;
        *) printf '%s\n' "${py_ip}"; return 0 ;;
      esac
    fi
  fi

  return 0
}

check_supported_distro() {
  detect_pkg_family
  if [[ -n "${PKG_FAMILY}" ]]; then
    echo -e "${GREEN}#${RESET} Detected supported package family: ${PKG_FAMILY}.\\n"
  else
    local os_id=''
    if [[ -r /etc/os-release ]]; then
      os_id="$(sed -nE 's/^ID=//p' /etc/os-release 2>/dev/null | sed 's/"//g')"
    fi
    echo -e "${YELLOW}#${RESET} WARNING: could not map this system (ID '${os_id:-unknown}') to a supported package family (debian/rhel/arch).\\n"
    echo -e "${YELLOW}#${RESET} Continuing — the update step only drives Docker, which is distro-agnostic.\\n"
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

get_update_confirmation(){
  if _nomad_assume_yes; then
    echo -e "${GREEN}#${RESET} NOMAD_ASSUME_YES set - continuing with the update."
    return 0
  fi
  read -p "This script will update Project NOMAD and its dependencies on your machine. No data loss is expected, but you should always back up your data before proceeding. Are you sure you want to continue? (y/n): " choice
  case "$choice" in
    y|Y )
      echo -e "${GREEN}#${RESET} User chose to continue with the update."
      ;;
    n|N )
      echo -e "${RED}#${RESET} User chose not to continue with the update."
      exit 0
      ;;
    * )
      echo "Invalid Response"
      echo "User chose not to continue with the update."
      exit 0
      ;;
  esac
}

ensure_docker_installed_and_running() {
  if ! command -v docker &> /dev/null; then
    echo -e "${RED}#${RESET} Docker is not installed. This is unexpected, as Project NOMAD requires Docker to run. Did you mean to use the install script instead of the update script?"
    exit 1
  fi

  # CI escape hatch (Issue #14, AC3): in a container without --privileged,
  # dockerd cannot start (needs cgroups + /dev/fuse). The daemon is not needed
  # for the matrix test — only the package install and CLI presence are under
  # test. So skip the daemon-reachability probe entirely.
  if [[ "${NOMAD_CI_MODE:-0}" == "1" ]]; then
    echo -e "${YELLOW}#${RESET} NOMAD_CI_MODE=1 — skipping Docker daemon check (CI container).\\n"
    return 0
  fi

  # Ensure the daemon is reachable. A container without a service manager
  # (CI) will not auto-start dockerd, so probe it and, failing that, launch
  # it directly before giving up.
  if ! docker info &> /dev/null; then
    if command -v systemctl &> /dev/null; then
      echo -e "${RED}#${RESET} Docker is not running. Attempting to start Docker..."
      ${SUDO} systemctl start docker 2> /dev/null || true
    fi
    if ! docker info &> /dev/null; then
      if command -v systemctl &> /dev/null; then
        ${SUDO} systemctl start docker 2> /dev/null || true
      fi
      if ! docker info &> /dev/null; then
        echo -e "${YELLOW}#${RESET} Starting the Docker daemon (no service manager detected)...\\n"
        ${SUDO} sh -c 'nohup dockerd >/tmp/dockerd-update.log 2>&1 &'
        local _attempt
        for _attempt in $(seq 1 30); do
          if docker info &> /dev/null; then
            break
          fi
          sleep 1
        done
      fi
    fi

    if ! docker info &> /dev/null; then
      echo -e "${RED}#${RESET} Failed to start Docker. Please start Docker and try again."
      exit 1
    fi
  fi
}

check_docker_compose() {
  # CI escape hatch (Issue #14, AC3): the compose v2 plugin is not present in
  # minimal distro base images, and 'docker compose version' probes the daemon.
  # The compose check is not under test in the matrix, so skip it in CI mode.
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

ensure_docker_compose_file_exists() {
  if [ ! -f "${NOMAD_DIR}/compose.yml" ]; then
    echo -e "${RED}#${RESET} compose.yml file not found. Please ensure it exists at ${NOMAD_DIR}/compose.yml."
    exit 1
  fi
}

force_recreate() {
  # CI escape hatch (Issue #14, AC3): compose pull/up need a running daemon,
  # which a non-privileged CI container cannot provide. The matrix test only
  # exercises package install + CLI presence, so skip the recreate step.
  if [[ "${NOMAD_CI_MODE:-0}" == "1" ]]; then
    echo -e "${YELLOW}#${RESET} NOMAD_CI_MODE=1 — skipping 'docker compose pull/up' (CI container, no daemon).\\n"
    return 0
  fi
  echo -e "${YELLOW}#${RESET} Pulling the latest Docker images...\\n"
  if ! docker compose -p project-nomad -f "${NOMAD_DIR}/compose.yml" pull; then
    echo -e "${RED}#${RESET} Failed to pull the latest Docker images. Please check your network connection and the Docker registry status, then try again."
    exit 1
  fi
  
  echo -e "${YELLOW}#${RESET} Forcing recreation of containers..."
  if ! docker compose -p project-nomad -f "${NOMAD_DIR}/compose.yml" up -d --force-recreate; then
    echo -e "${RED}#${RESET} Failed to recreate containers. Please check the Docker logs for more details."
    exit 1
  fi
}

get_local_ip() {
  local_ip_address="$(resolve_local_ip)"
  if [[ -z "$local_ip_address" ]]; then
    echo -e "${RED}#${RESET} Unable to determine local IP address. Please check your network configuration."
    # Don't exit if we can't determine the local IP address, it's not critical for the installation
  else
    echo -e "${GREEN}#${RESET} Local IP resolved to: ${local_ip_address}\\n"
  fi
}

success_message() {
  echo -e "${GREEN}#${RESET} Project NOMAD update completed successfully!\\n"
  echo -e "${GREEN}#${RESET} Installation files are located at ${NOMAD_DIR}\\n\\n"
  echo -e "${GREEN}#${RESET} Project NOMAD's Command Center should automatically start whenever your device reboots. However, if you need to start it manually, you can always do so by running: ${WHITE_R}${NOMAD_DIR}/start_nomad.sh${RESET}\\n"
  echo -e "${GREEN}#${RESET} You can now access the management interface at http://localhost:8080 or http://${local_ip_address}:8080\\n"
  echo -e "${GREEN}#${RESET} Thank you for supporting Project NOMAD!\\n"
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Main Script                                                                                           #
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

# Pre-flight checks
check_supported_distro
check_is_bash
check_has_sudo

# Main update
get_update_confirmation
ensure_docker_installed_and_running
check_docker_compose
ensure_docker_compose_file_exists
force_recreate
get_local_ip
success_message

fi  # sourcing guard
