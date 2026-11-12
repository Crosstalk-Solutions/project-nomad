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
# Default source of the compose file + helper scripts. By default these point at the
# upstream Crosstalk-Solutions/project-nomad `main` branch — byte-identical to the
# historically hardcoded URLs, so an unmodified install behaves exactly as before.
# A fork that ships its own helper scripts (distro-gate, NVIDIA, download fixes, …)
# can redirect the installer at itself with these two env vars, set together:
#   NOMAD_SOURCE_REPO=<owner>/<repo>     e.g. BuboTheWise/nomad-unchained
#   NOMAD_SOURCE_REF=<branch or tag>     e.g. main
# If either is left unset it falls back to the upstream default for that part, so a
# single partial override is always well-defined. The mapping is GitHub ref syntax
# (refs/heads/<ref>), which keeps a future upstream branch rename from silently 404-ing
# only some of the downloads: all four artifact URLs are derived from ONE base below.
resolve_source_urls() {
  local src_repo="${NOMAD_SOURCE_REPO:-Crosstalk-Solutions/project-nomad}"
  local src_ref="${NOMAD_SOURCE_REF:-main}"

  # One base, four derived URLs — single source of truth. No per-URL owner literals.
  local base="https://raw.githubusercontent.com/${src_repo}/refs/heads/${src_ref}/install"
  MANAGEMENT_COMPOSE_FILE_URL="${base}/management_compose.yaml"
  START_SCRIPT_URL="${base}/start_nomad.sh"
  STOP_SCRIPT_URL="${base}/stop_nomad.sh"
  UPDATE_SCRIPT_URL="${base}/update_nomad.sh"
}
resolve_source_urls
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

banner() {
  echo ""
  echo -e "${GREEN}"
  cat <<'NOMAD_ART'
                             P R O J E C T
                    _   _  ___  __  __    _    ____
                   | \ | |/ _ \|  \/  |  / \  |  _ \
                   |  \| | | | | |\/| | / _ \ | | | |
                   | |\  | |_| | |  | |/ ___ \| |_| |
                   |_| \_|\___/|_|  |_/_/   \_\____/
NOMAD_ART
  echo -e "${RESET}"
  echo -e "${WHITE_R}                 Offline knowledge and education server${RESET}\n"
  echo -e "${GREEN}#########################################################################${RESET}\n"
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
# Multi-distro package dispatch (Debian / RHEL / Arch).
# Detect the family ONCE and route every install through pkg_install() so the
# rest of the script never hardcodes `apt-get`. Logical deps are mapped to the
# family's package names where they differ (e.g. gpg -> gnupg on Arch).
# Upstream: project-nomad issue #1, PR #243 ("add multi-distro Linux support"),
# and issue #1381 (hostname -I unavailable on Arch).
PKG_FAMILY=''

detect_pkg_family() {
  local os_ids=''
  if [[ -r /etc/os-release ]]; then
    os_ids="$(sed -nE 's/^(ID|ID_LIKE)=//p' /etc/os-release 2>/dev/null | sed 's/"//g' | tr '\n' ' ')"
  fi

  # A manager on PATH is the authoritative signal — it is the call we can
  # actually make. Fall back to os-release lineage only when no manager is
  # found, so a minimal image is reported accurately.
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

# Map a logical dependency name to the detected family's package name.
# Only names that actually drift across distros are special-cased — on Arch the
# `gpg` binary ships in the `gnupg` package. Everything else is pass-through.
pkg_map_name() {
  local logical="$1"
  if [[ "${PKG_FAMILY}" == 'arch' && "${logical}" == 'gpg' ]]; then
    printf '%s\n' 'gnupg'
  else
    printf '%s\n' "${logical}"
  fi
}

# Map a logical dep to the binary its package provides (so we can check whether
# it is already present before installing). gpg is the exception — it can come
# from the `gpg` package (debian/rhel) or `gnupg` (arch), but the binary name
# is `gpg` either way. pciutils -> lspci.
pkg_dep_bin() {
  case "$1" in
    pciutils) printf '%s\n' 'lspci' ;;
    gpg)      printf '%s\n' 'gpg' ;;
    *)        printf '%s\n' "$1" ;;
  esac
}

# pkg_install <logical-dep...> — install packages with the detected family's
# manager, remapping logical dep names where a distro names the package
# differently (e.g. gpg -> gnupg on Arch).
#
# Idempotent: a dep whose binary is ALREADY on PATH is skipped. This is what
# keeps a minimal RHEL image (rockylinux/almalinux) from tripping the
# `curl-minimal` vs `curl` dnf conflict, and it makes re-runs cheap and safe.
pkg_install() {
  local -a pkgs=()
  local logical bin
  for logical in "$@"; do
    bin="$(pkg_dep_bin "${logical}")"
    # Skip if the dependency's binary is already available (idempotency).
    if command -v "${bin}" &> /dev/null; then
      continue
    fi
    pkgs+=("$(pkg_map_name "${logical}")")
  done

  # Nothing to do — every dependency is already satisfied.
  if [[ ${#pkgs[@]} -eq 0 ]]; then
    return 0
  fi

  case "${PKG_FAMILY}" in
    debian)
      ${SUDO} apt-get update
      ${SUDO} apt-get install -y "${pkgs[@]}"
      ;;
    rhel)
      ${SUDO} dnf install -y "${pkgs[@]}"
      ;;
    arch)
      ${SUDO} pacman -S --noconfirm --needed "${pkgs[@]}"
      ;;
    *)
      echo -e "${RED}#${RESET} No supported package manager found (expected apt, dnf, or pacman). Please install: ${*}\\n"
      return 1
      ;;
  esac
}

# Resolve the first usable IPv4: non-loopback and off the Docker / link-local
# subnets. Tries hostname -I, then `ip -4 -o addr show`, then ifconfig, then a
# python3 socket fallback. Prints the address, or nothing. Upstream: issue #2.
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
  for ip in "${ips[@]}"; do
    [[ -z "${ip}" ]] && continue
    case "${ip}" in
      127.0.0.*|169.254.*|172.17.*) continue ;;
    esac
    if [[ "${ip}" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
      printf '%s\n' "${ip}"
      return 0
    fi
  done

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

  return 0  # no candidate resolved; caller decides fail vs warn
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
    echo -e "${YELLOW}#${RESET} Continuing — Docker installs via get.docker.com, but a missing package manager may block the dependency step.\\n"
  fi
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
    pkg_install "${missing_deps[@]}"

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

# install_docker_native — install Docker from the distro's own package repo.
# Routed here for two groups (issue #7 AC-1):
#   1. Distro IDs get.docker.com (SCRIPT_COMMIT ada7a567, 2026-11-03) rejects
#      at install time: Arch / CachyOS / Manjaro / EndeavourOS (its "arch"
#      family isn't in the supported list) and AlmaLinux ("almalinux") / Oracle
#      Linux ("ol") (neither is in the centos|fedora|rhel|rocky accept-list);
#      the convenience script exits 1 with "Unsupported distribution" before
#      installing anything.
#   2. The RHEL-family IDs the card names for the native path — `rhel` and
#      `rocky` — which, although *accept-listed*, are routed to the Docker CE
#      RPM repo so every `dnf`-based host installs identically; this matches
#      the per-family house style already used by setup_nvidia_container_toolkit.
# Only the fedora IDs stay on the get.docker.com convenience path to keep the
# change thin and rebaseable against upstream (see AC-4).
#
# Upstream references (issue #7 "Upstream path"):
#   - Crosstalk-Solutions/project-nomad PR #243 — "Docker installs from
#     native repos on Arch and openSUSE since get.docker.com doesn't support
#     them." Same approach we're re-applying here; got a positive maintainer
#     review ("Clean distro detection, good fallback handling… No concerns")
#     but was closed unmerged on 2026-04-02 when its base branch was deleted,
#     so we carry the approach in a thin, rebaseable fork patch.
#   - Crosstalk-Solutions/project-nomad issue #1402 — a get.docker.com failure
#     on Zorin (a fork-detection case of the same underlying problem).
#     Related but separate.
#
# Per-family behavior:
#   arch  — `pacman -S --noconfirm --needed docker docker-compose` followed
#           by `systemctl enable --now docker`. Arch's `docker-compose`
#           package IS the Compose v2 CLI plugin binary.
#   rhel  — `dnf config-manager --add-repo https://download.docker.com/linux/rhel/
#           docker-ce.repo` followed by `dnf install -y docker-ce docker-ce-cli
#           containerd.io docker-buildx-plugin docker-compose-plugin`,
#           followed by `systemctl enable --now docker`. The same Docker CE
#           repo that Debian/Ubuntu uses is the documented source for
#           AlmaLinux 9, Oracle Linux, RHEL and Rocky (all ship `dnf
#           config-manager`).
#
# On a failure this function returns non-zero — the caller (
# ensure_docker_installed) is responsible for printing the failure line and
# exiting, so the message stays consistent with the get.docker.com path.
install_docker_native() {
  local family="${1}"
  local distro=""
  if [[ -r /etc/os-release ]]; then
    distro="$(sed -nE 's/^ID=//p' /etc/os-release 2>/dev/null | sed 's/"//g' | head -n 1)"
  fi

  case "${family}" in
    arch)
      echo -e "${YELLOW}#${RESET} (arch) Installing docker via pacman...\\n"
      # Prerequisites, routed through the family's dispatcher.
      pkg_install ca-certificates curl
      if ! sudo pacman -S --noconfirm --needed docker docker-compose; then
        return 1
      fi
      ;;
    rhel)
      echo -e "${YELLOW}#${RESET} (rhel/${distro:-unknown}) Installing docker-ce via dnf...\\n"
      pkg_install ca-certificates curl
      # dnf config-manager ships in RHEL-compatible distros (Alma 9, Oracle
      # Linux 8+, Rocky 9+). If the caller somehow ends up here without it,
      # give a targeted error rather than a bare dnf failure.
      if ! command -v dnf &> /dev/null || ! dnf config-manager --version &> /dev/null 2>&1; then
        echo -e "${RED}#${RESET} dnf (with config-manager plugin) is required for the Docker CE RPM repo. Please install it (e.g. dnf install dnf-plugins-core) and try again.\\n"
        return 1
      fi
      if ! sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo; then
        echo -e "${RED}#${RESET} Failed to add the Docker CE RPM repository (https://download.docker.com/linux/rhel/docker-ce.repo).\\n"
        return 1
      fi
      if ! sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; then
        echo -e "${RED}#${RESET} Failed to install Docker CE packages via dnf.\\n"
        return 1
      fi
      ;;
  esac

  # Bring the Docker daemon up and leave it enabled across reboots, so the
  # "is docker active" check in the caller and the downstream `docker
  # compose version` check both succeed without needing a separate start.
  if ! sudo systemctl enable --now docker; then
    echo -e "${RED}#${RESET} Failed to enable & start the Docker service after the package install.\\n"
    return 1
  fi
  return 0
}

ensure_docker_installed() {
  local family="${PKG_FAMILY}"
  local osid=""
  local native_tried="no"
  local podman_shim=0

  # RHEL-family hosts commonly ship `podman-docker`, which aliases /usr/bin/docker
  # to podman. `command -v docker` then succeeds even though the Docker Engine unit
  # was never installed, and the "docker version" check reports
  # "podman version …" and passes — but downstream `docker compose version` will
  # still work and everything will appear green while the daemon we're
  # actually talking to is podman. Detect this up front and print a clear
  # warning rather than continuing into `systemctl start docker` on a unit
  # that isn't Docker Engine. (Issue #7, "Related" note.)
  if command -v docker &> /dev/null; then
    local docker_ver_line
    docker_ver_line="$(docker --version 2>&1 | head -n 1)"
    if printf '%s' "${docker_ver_line}" | grep -qi 'podman'; then
      podman_shim=1
    fi
  fi

  if [[ -n "${family}" ]]; then
    case "${family}" in
      arch)
        native_tried="yes"
        install_docker_native arch || { echo -e "${RED}#${RESET} Docker installation failed. Please check the logs and try again."; exit 1; }
        ;;
      rhel)
        if [[ -r /etc/os-release ]]; then
          osid="$(sed -nE 's/^ID=//p' /etc/os-release 2>/dev/null | sed 's/"//g' | head -n 1)"
        fi
        # get.docker.com's accept-list is ubuntu|debian|raspbian +
        # centos|fedora|rhel|rocky. AlmaLinux's ID is "almalinux" and Oracle
        # Linux's is "ol"; the script keys off the primary ID, so both hit
        # "Unsupported distribution" and exit 1 before installing anything
        # (issue #7).
        #
        # Per issue #7 AC-1, `almalinux/ol/rhel/rocky` are all routed to
        # dnf (native Docker CE RPM repo). Only the fedora IDs stay on the
        # get.docker.com path (that family is in the script's accept-list)
        # to keep the change thin and rebaseable against upstream.
        case "${osid}" in
          almalinux|ol|oracle|rhel|rocky)
            native_tried="yes"
            install_docker_native rhel || { echo -e "${RED}#${RESET} Docker installation failed. Please check the logs and try again."; exit 1; }
            ;;
          *)
            :; # fedora and other: fall through to get.docker.com
            ;;
        esac
        ;;
      debian)
        :; # get.docker.com default path
        ;;
    esac
  fi

  # On any host where the native path was not taken (debian, or fedora-family
  # IDs like centos that get.docker.com accepts), run the existing
  # get.docker.com convenience script. The Debian/Ubuntu path is therefore
  # byte-for-byte the same code as before; only the entry point into this
  # function has changed.
  if [[ "${native_tried}" == "yes" ]]; then
    # A native install was attempted on this run. If docker still doesn't
    # resolve to a real Engine, exit with a clear message (the failure was
    # already reported by install_docker_native).
    if ! command -v docker &> /dev/null || ! docker version &> /dev/null 2>&1; then
      echo -e "${RED}#${RESET} Docker installation failed. Please check the logs and try again."
      exit 1
    fi
    echo -e "${GREEN}#${RESET} Docker installation completed.\\n"
  elif [[ "${podman_shim}" -eq 1 ]]; then
    echo -e "${YELLOW}#${RESET} Found a podman shim for 'docker' — 'docker --version' reads:${RESET}\\n"
    echo -e "  $(docker --version 2>&1 | head -n 1)\\n"
    echo -e "${RED}#${RESET} NOMAD requires the Docker Engine unit (dockerd), not podman. Uninstall the podman-docker shim (or remove the alias) and re-run the installer.\\n"
    exit 1
  else
    if ! command -v docker &> /dev/null; then
      echo -e "${YELLOW}#${RESET} Docker not found. Installing Docker...\\n"

      # Prerequisites, routed through the detected package family.
      pkg_install ca-certificates curl

      # Download the Docker convenience script
      curl -fsSL https://get.docker.com -o get-docker.sh

      # Run the Docker installation script
      ${SUDO} sh get-docker.sh

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
        echo -e "${YELLOW}#${RESET} Docker is installed but not running. Enabling on boot and starting Docker...\\n"
        ${SUDO} systemctl enable --now docker
        if ! systemctl is-active --quiet docker; then
          echo -e "${RED}#${RESET} Failed to start Docker. Please check the Docker service status and try again."
          exit 1
        else
          echo -e "${GREEN}#${RESET} Docker service enabled on boot and started successfully.\\n"
        fi
      else
        echo -e "${GREEN}#${RESET} Docker service is already running.\\n"
      fi
    fi
  fi

  # Ensure the daemon is actually reachable. A container without a service
  # manager (CI) will not auto-start dockerd, so probe it and, failing that,
  # launch it directly before giving up.
  _ensure_docker_daemon
}

_ensure_docker_daemon() {
  if docker info &> /dev/null; then
    return 0
  fi

  if command -v systemctl &> /dev/null; then
    echo -e "${YELLOW}#${RESET} Docker is installed but not reachable. Attempting to start the service...\\n"
    sudo systemctl start docker 2> /dev/null || true
  fi

  if docker info &> /dev/null; then
    echo -e "${GREEN}#${RESET} Docker daemon is running.\\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Starting the Docker daemon (no service manager detected)...\\n"
  sudo sh -c 'nohup dockerd >/tmp/dockerd.log 2>&1 &'

  local _attempt
  for _attempt in $(seq 1 30); do
    if docker info &> /dev/null; then
      echo -e "${GREEN}#${RESET} Docker daemon is running.\\n"
      return 0
    fi
    sleep 1
  done

  echo -e "${RED}#${RESET} Failed to start the Docker daemon. Please start Docker and try again."
  exit 1
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

# Install the NVIDIA container toolkit with the detected family's package
# manager. Each family pulls the package from NVIDIA's official source for
# that distro:
#   debian  - NVIDIA deb repository (GPG keyring + apt source entry)
#   rhel    - NVIDIA rpm repository (official nvidia-container-toolkit.repo)
#   arch    - official extra repositories
#
# This function is non-blocking: on any failure it prints a warning and
# returns 0 so the rest of the installation can continue (GPU support is a
# nicety, not a hard requirement).
install_nvidia_toolkit_for_family() {
  local family="${1:-}"

  case "${family}" in
    debian)
      echo -e "${YELLOW}#${RESET} (debian) Adding NVIDIA container toolkit apt repository...\\n"

      # Import the NVIDIA GPG key into the trustable keyring.
      local keyring_path="/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg"
      if ! curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey 2>/dev/null \
          | ${SUDO} gpg --batch --yes --dearmor -o "${keyring_path}" 2>/dev/null; then
        echo -e "${YELLOW}#${RESET} Warning: Failed to add NVIDIA container toolkit GPG key.\\n"
        echo -e "${YELLOW}#${RESET} GPU support for containers will be unavailable; the install will continue.\\n"
        return 0
      fi

      # Register the stable deb repository against that keyring.
      if ! curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list 2>/dev/null \
          | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
          | ${SUDO} tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null 2>&1; then
        echo -e "${YELLOW}#${RESET} Warning: Failed to add NVIDIA container toolkit apt repository.\\n"
        echo -e "${YELLOW}#${RESET} GPU support for containers will be unavailable; the install will continue.\\n"
        return 0
      fi

      if ! ${SUDO} apt-get update 2>/dev/null; then
        echo -e "${YELLOW}#${RESET} Warning: Failed to refresh the apt package list.\\n"
      fi

      if ! ${SUDO} apt-get install -y nvidia-container-toolkit 2>/dev/null; then
        echo -e "${YELLOW}#${RESET} Warning: Failed to install NVIDIA container toolkit.\\n"
        echo -e "${YELLOW}#${RESET} GPU support for containers will be unavailable; the install will continue.\\n"
        return 0
      fi
      ;;

    rhel)
      echo -e "${YELLOW}#${RESET} (rhel/fedora) Adding NVIDIA container rpm repository...\\n"

      local repo_file="/etc/yum.repos.d/nvidia-container-toolkit.repo"
      if [[ ! -f "${repo_file}" ]]; then
        if ! curl -fsSL https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo 2>/dev/null \
            | ${SUDO} tee "${repo_file}" > /dev/null 2>&1; then
          echo -e "${YELLOW}#${RESET} Warning: Failed to add NVIDIA container toolkit rpm repository.\\n"
          echo -e "${YELLOW}#${RESET} GPU support for containers will be unavailable; the install will continue.\\n"
          return 0
        fi
      fi

      # gpgcheck is disabled in the official NVIDIA .repo file (gpgkey points
      # at NVIDIA's key), so a separate key import is not required here.
      if ! ${SUDO} dnf install -y nvidia-container-toolkit 2>/dev/null; then
        echo -e "${YELLOW}#${RESET} Warning: Failed to install NVIDIA container toolkit.\\n"
        echo -e "${YELLOW}#${RESET} GPU support for containers will be unavailable; the install will continue.\\n"
        return 0
      fi
      ;;

    arch)
      echo -e "${YELLOW}#${RESET} (arch) Installing NVIDIA container toolkit from official repositories...\\n"

      if ! ${SUDO} pacman -S --noconfirm --needed nvidia-container-toolkit 2>/dev/null; then
        echo -e "${YELLOW}#${RESET} Warning: Failed to install NVIDIA container toolkit.\\n"
        echo -e "${YELLOW}#${RESET} GPU support for containers will be unavailable; the install will continue.\\n"
        return 0
      fi
      ;;

    *)
      echo -e "${YELLOW}#${RESET} Warning: No supported package manager for family '${family:-unknown}'.\\n"
      echo -e "${YELLOW}#${RESET} NVIDIA container toolkit must be installed manually for GPU support.\\n"
      ;;
  esac
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
  
  # Install the toolkit using the detected package family. Each family uses
  # NVIDIA's official distribution channel:
  #   debian  -> deb repository (keyring + apt source)
  #   rhel    -> rpm repository (official nvidia-container-toolkit.repo via dnf)
  #   arch    -> extra repositories (pacman)
  #
  # All failure paths are non-blocking: a warning is emitted and the install
  # continues, so hosts without an NVIDIA GPU (or with a partial toolkit)
  # still complete their installation.
  #
  # ensure_dependencies_installed already ran before this function, so curl
  # (for the repository metadata) and gpg (for the debian keyring) are in
  # place; dnf and pacman are provided by the base images of their families.
  install_nvidia_toolkit_for_family "${PKG_FAMILY}"
  
  echo -e "${GREEN}#${RESET} NVIDIA container toolkit installed successfully.\\n"
  
  # Configure Docker to use NVIDIA runtime
  echo -e "${YELLOW}#${RESET} Configuring Docker to use NVIDIA runtime...\\n"
  
  if ! ${SUDO} nvidia-ctk runtime configure --runtime=docker 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} nvidia-ctk configure failed, attempting manual configuration...\\n"
    
    # Fallback: Manually configure daemon.json
    local daemon_json="/etc/docker/daemon.json"
    local config_success=false
    
    if [[ -f "$daemon_json" ]]; then
      # Backup existing config (best effort)
      ${SUDO} cp "$daemon_json" "${daemon_json}.backup" 2>/dev/null || true
      
      # Check if nvidia runtime already exists
      if ! grep -q '"nvidia"' "$daemon_json" 2>/dev/null; then
        # Add nvidia runtime to existing config using jq if available
        if command -v jq &> /dev/null; then
          if ${SUDO} jq '. + {"runtimes": {"nvidia": {"path": "nvidia-container-runtime", "runtimeArgs": []}}}' "$daemon_json" > /tmp/daemon.json.tmp 2>/dev/null; then
            if ${SUDO} mv /tmp/daemon.json.tmp "$daemon_json" 2>/dev/null; then
              config_success=true
            fi
          fi
          # Clean up temp file if move failed
          ${SUDO} rm -f /tmp/daemon.json.tmp 2>/dev/null || true
        else
          echo -e "${YELLOW}#${RESET} jq not available, skipping manual daemon.json configuration...\\n"
        fi
      else
        config_success=true  # Already configured
      fi
    else
      # Create new daemon.json with nvidia runtime (best effort)
      if echo '{"runtimes":{"nvidia":{"path":"nvidia-container-runtime","runtimeArgs":[]}}}' | ${SUDO} tee "$daemon_json" > /dev/null 2>&1; then
        config_success=true
      fi
    fi
    
    if ! $config_success; then
      echo -e "${YELLOW}#${RESET} Manual daemon.json configuration unsuccessful. GPU support may require manual setup.\\n"
    fi
  fi
  
  # Restart Docker service
  echo -e "${YELLOW}#${RESET} Restarting Docker service...\\n"
  if ! ${SUDO} systemctl restart docker 2>/dev/null; then
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

# Returns 0 (true) when the caller wants non-interactive "yes to all" behavior.
# Used by CI and any automation that must run the scripts without a TTY.
_nomad_assume_yes() {
  case "${NOMAD_ASSUME_YES:-}" in
    1|true|TRUE|True|yes|YES|Yes|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

get_install_confirmation(){
  if _nomad_assume_yes; then
    echo -e "${GREEN}#${RESET} NOMAD_ASSUME_YES set - continuing with the installation."
    return 0
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
  if _nomad_assume_yes; then
    accepted_terms='true'
    echo -e "${GREEN}#${RESET} NOMAD_ASSUME_YES set - License Agreement & Terms of Use accepted."
    return 0
  fi
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
    ${SUDO} mkdir -p "$NOMAD_DIR"
    ${SUDO} chown "$(whoami):$(whoami)" "$NOMAD_DIR"

    echo -e "${GREEN}#${RESET} Directory created successfully.\\n"
  else
    echo -e "${GREEN}#${RESET} Directory $NOMAD_DIR already exists.\\n"
  fi

  # Also ensure the directory has a /storage/logs/ subdirectory
  ${SUDO} mkdir -p "${NOMAD_DIR}/storage/logs"

  # Create a admin.log file in the logs directory
  ${SUDO} touch "${NOMAD_DIR}/storage/logs/admin.log"
}

download_management_compose_file() {
  local compose_file_path="${NOMAD_DIR}/compose.yml"

  echo -e "${YELLOW}#${RESET} Downloading docker-compose file for management...\\n"
  if ! curl -fsSL "$MANAGEMENT_COMPOSE_FILE_URL" -o "$compose_file_path"; then
    echo -e "${RED}#${RESET} Failed to download the docker compose file. Please check the URL and try again."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Docker compose file downloaded successfully to $compose_file_path.\\n"

  local app_key db_root_password db_user_password
  app_key=$(generateRandomPass)
  db_root_password=$(generateRandomPass)
  db_user_password=$(generateRandomPass)

  # MySQL data-directory guard (issue #5):
  #
  #   MySQL only honours MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / MYSQL_DATABASE
  #   on the FIRST start, and only when the data directory is EMPTY. Against a
  #   populated data dir it keeps the credentials it was originally initialized
  #   with and ignores any new ones. Two consequences drive this guard:
  #
  #     * The historical behaviour was `rm -rf ${NOMAD_DIR}/mysql` on every
  #       install, which reliably avoided "Access denied" but destroyed a
  #       healthy user's whole database on every reinstall / upgrade — the bug
  #       this fix addresses.
  #     * Simply stopping the wipe is NOT enough: the installer regenerates
  #       random credentials below each run, so a preserved data dir would keep
  #       the OLD creds while the admin container is handed NEW ones → the same
  #       "Access denied" reappears. A preserve MUST therefore also reuse the
  #       credentials the data dir was actually initialized with.
  #
  #   This installer records those credentials in ${NOMAD_DIR}/.nomad-mysql-init
  #   on the first successful install. On a re-run the decision is:
  #
  #     NOMAD_RESET_DB=1  Explicit: always rm the data dir and re-init fresh
  #                       (restores the original rm -rf for when you want a
  #                       hard reset).
  #     NOMAD_KEEP_DB=1   Explicit: never touch the data dir. If a credential
  #                       record exists we reuse it, otherwise we inject fresh
  #                       random creds and MySQL may keep the old ones.
  #     (default)         - Healthy dir + credential record  -> PRESERVE and
  #                                                                 reuse those creds.
  #                       - Data dir present, no record (stale/orphan/interrupted
  #                          attempt)                        -> RM and re-init
  #                                                                 fresh (the original intent).
  #                       - No data dir at all               -> FRESH init with the new creds.
  #
  #   "Healthy" is detected by the presence of a real schema directory
  #   (${NOMAD_DIR}/mysql/mysql) or the InnoDB system tablespace (ibdata1).
  local mysql_populated=0
  if [[ -d "${NOMAD_DIR}/mysql/mysql" || -f "${NOMAD_DIR}/mysql/ibdata1" ]]; then
    mysql_populated=1
  fi

  local reuse_existing=0
  local creds_file="${NOMAD_DIR}/.nomad-mysql-init"

  if [[ "${NOMAD_KEEP_DB:-0}" == "1" ]]; then
    echo -e "${YELLOW}#${RESET} NOMAD_KEEP_DB=1 — preserving any existing MySQL data directory.\\n"
    if [[ -f "${creds_file}" ]]; then
      reuse_existing=1
    fi
  elif [[ -n "${NOMAD_RESET_DB:-}" ]]; then
    if [[ -d "${NOMAD_DIR}/mysql" ]]; then
      echo -e "${YELLOW}#${RESET} NOMAD_RESET_DB set — removing existing MySQL data directory for a fresh init...\\n"
      ${SUDO} rm -rf "${NOMAD_DIR}/mysql"
    fi
  elif [[ "${mysql_populated}" -eq 1 && -f "${creds_file}" ]]; then
    reuse_existing=1
    echo -e "${GREEN}#${RESET} Existing MySQL data directory with a matching credential record — preserving it (data survives reinstall / upgrade). Reusing the stored credentials.\\n"
  elif [[ -d "${NOMAD_DIR}/mysql" ]]; then
    # Data dir present but no credential record → stale/orphaned from an
    # interrupted attempt. We don't know its creds, so re-init fresh (the
    # original intent of the guard) rather than ship a broken "Access denied".
    echo -e "${YELLOW}#${RESET} Found a MySQL data directory without a credential record — removing it for a clean fresh init...\\n"
    ${SUDO} rm -rf "${NOMAD_DIR}/mysql"
  else
    echo -e "${YELLOW}#${RESET} No existing MySQL data directory — will initialize fresh with the new credentials.\\n"
  fi

  # Keep the injected credentials consistent with the (possibly preserved)
  # data dir: either reload what the dir was initialized with, or record the
  # new ones so the NEXT install can preserve correctly.
  #
  # ${NOMAD_DIR} is user-owned (see create_nomad_directory), so write the
  # credential file as the invoking user directly — if we used `sudo tee` it
  # would end up root-owned and unreadable by the user on the next run when
  # the guard sources it.
  if [[ "${reuse_existing}" -eq 1 ]]; then
    # Credential values are [A-Za-z0-9] only (generateRandomPass), safe to source.
    # The file lives at a runtime-computed path, so tell shellcheck not to follow it.
    # shellcheck source=/dev/null
    . "${creds_file}"
    app_key="${NOMAD_MYSQL_APP_KEY}"
    db_root_password="${NOMAD_MYSQL_ROOT_PW}"
    db_user_password="${NOMAD_MYSQL_USER_PW}"
  else
    {
      printf 'NOMAD_MYSQL_APP_KEY=%s\n' "${app_key}"
      printf 'NOMAD_MYSQL_ROOT_PW=%s\n' "${db_root_password}"
      printf 'NOMAD_MYSQL_USER_PW=%s\n' "${db_user_password}"
    } > "${creds_file}" || true
    chmod 600 "${creds_file}" 2>/dev/null || true
  fi

  # Inject dynamic env values into the compose file
  echo -e "${YELLOW}#${RESET} Configuring docker-compose file env variables...\\n"
  sed -i "s|URL=replaceme|URL=http://${local_ip_address}:8080|g" "$compose_file_path"
  sed -i "s|APP_KEY=replaceme|APP_KEY=${app_key}|g" "$compose_file_path"
  
  sed -i "s|DB_PASSWORD=replaceme|DB_PASSWORD=${db_user_password}|g" "$compose_file_path"
  sed -i "s|MYSQL_ROOT_PASSWORD=replaceme|MYSQL_ROOT_PASSWORD=${db_root_password}|g" "$compose_file_path"
  sed -i "s|MYSQL_PASSWORD=replaceme|MYSQL_PASSWORD=${db_user_password}|g" "$compose_file_path"
  
  echo -e "${GREEN}#${RESET} Docker compose file configured successfully.\\n"
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

start_management_containers() {
  echo -e "${YELLOW}#${RESET} Starting management containers using docker compose...\\n"
  if ! ${SUDO} docker compose -p project-nomad -f "${NOMAD_DIR}/compose.yml" up -d; then
    echo -e "${RED}#${RESET} Failed to start management containers. Please check the logs and try again."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Management containers started successfully.\\n"
}

get_local_ip() {
  local_ip_address="$(resolve_local_ip)"
  if [[ -z "$local_ip_address" ]]; then
    echo -e "${RED}#${RESET} Unable to determine local IP address. Please check your network configuration."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Local IP resolved to: ${local_ip_address}\\n"
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
      elif echo "${amd_devices}" | grep -iEq 'Phoenix[0-9]?|Hawk ?Point ?[0-9]?|Radeon (780M|760M)'; then
        # Phoenix (Ryzen 7040) / Hawk Point (Ryzen 8040) — 780M & 760M are both gfx1103.
        # lspci device strings vary (Phoenix1/Phoenix2/Phoenix3, "Hawk Point", "HawkPoint1", or the bare
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
    echo 'nvidia' | ${SUDO} tee "${gpu_marker_path}" > /dev/null 2>&1 || true
  elif [[ "${has_amd_gpu}" == 'true' ]]; then
    echo 'amd' | ${SUDO} tee "${gpu_marker_path}" > /dev/null 2>&1 || true
  else
    ${SUDO} rm -f "${gpu_marker_path}" 2>/dev/null || true
  fi

  # Companion marker used by the admin to pick the right HSA_OVERRIDE_GFX_VERSION for
  # the detected card. Absence of this file means "unknown gfx" — the admin falls back
  # to its built-in default. Always rewrite (or remove) on install to keep state fresh.
  local amd_gfx_marker_path="${NOMAD_DIR}/storage/.nomad-amd-gfx"
  if [[ -n "${amd_gfx_version}" ]]; then
    echo "${amd_gfx_version}" | ${SUDO} tee "${amd_gfx_marker_path}" > /dev/null 2>&1 || true
  else
    ${SUDO} rm -f "${amd_gfx_marker_path}" 2>/dev/null || true
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
check_is_x86_64
check_is_bash
check_has_sudo
ensure_dependencies_installed
check_is_debug_mode

# Main install
banner
get_install_confirmation
accept_terms
ensure_docker_installed
check_docker_compose
setup_nvidia_container_toolkit
get_local_ip
create_nomad_directory
download_helper_scripts
download_management_compose_file
start_management_containers
verify_gpu_setup
success_message

fi  # sourcing guard

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
