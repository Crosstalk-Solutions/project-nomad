#!/bin/bash
set -euo pipefail

NOMAD_DIR="${NOMAD_DIR:-$HOME/.project-nomad}"
NOMAD_PORT="${NOMAD_PORT:-8080}"
COMPOSE_URL="${COMPOSE_URL:-https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/management_compose.yaml}"
WORKER_URL="${WORKER_URL:-https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/macos/nomad-mac-ai/worker.py}"

log() { printf '# %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
rand() { LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "${1:-32}"; }

[[ "$(uname -s)" == "Darwin" ]] || fail "This installer is for macOS only."
[[ "$(uname -m)" == "arm64" ]] || log "Apple Silicon was not detected. Native MLX/Core ML acceleration requires Apple Silicon."
command -v docker >/dev/null 2>&1 || fail "Docker Desktop or Colima with Docker CLI is required."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."
command -v python3 >/dev/null 2>&1 || fail "python3 is required for the native Mac AI worker."

mkdir -p "$NOMAD_DIR/storage/logs" "$NOMAD_DIR/mac-ai/models" "$NOMAD_DIR/mac-ai/bin"
log "Installing Project N.O.M.A.D. into $NOMAD_DIR"

curl -fsSL "$COMPOSE_URL" -o "$NOMAD_DIR/compose.yml"

app_key="$(rand)"
db_root_password="$(rand)"
db_user_password="$(rand)"

sed -i '' "s|/opt/project-nomad/storage|$NOMAD_DIR/storage|g" "$NOMAD_DIR/compose.yml"
sed -i '' "s|/opt/project-nomad/mysql|$NOMAD_DIR/mysql|g" "$NOMAD_DIR/compose.yml"
sed -i '' "s|/opt/project-nomad/redis|$NOMAD_DIR/redis|g" "$NOMAD_DIR/compose.yml"
sed -i '' "s|/opt/project-nomad:/opt/project-nomad|$NOMAD_DIR:/opt/project-nomad|g" "$NOMAD_DIR/compose.yml"
sed -i '' "s|URL=replaceme|URL=http://localhost:$NOMAD_PORT|g" "$NOMAD_DIR/compose.yml"
sed -i '' "s|APP_KEY=replaceme|APP_KEY=$app_key|g" "$NOMAD_DIR/compose.yml"
sed -i '' "s|DB_PASSWORD=replaceme|DB_PASSWORD=$db_user_password|g" "$NOMAD_DIR/compose.yml"
sed -i '' "s|MYSQL_ROOT_PASSWORD=replaceme|MYSQL_ROOT_PASSWORD=$db_root_password|g" "$NOMAD_DIR/compose.yml"
sed -i '' "s|MYSQL_PASSWORD=replaceme|MYSQL_PASSWORD=$db_user_password|g" "$NOMAD_DIR/compose.yml"

curl -fsSL "$WORKER_URL" -o "$NOMAD_DIR/mac-ai/bin/worker.py"
chmod +x "$NOMAD_DIR/mac-ai/bin/worker.py"

python3 -m venv "$NOMAD_DIR/mac-ai/venv"
"$NOMAD_DIR/mac-ai/venv/bin/python" -m pip install --upgrade pip
"$NOMAD_DIR/mac-ai/venv/bin/python" -m pip install mlx-lm coremltools

plist="$HOME/Library/LaunchAgents/us.projectnomad.mac-ai.plist"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>us.projectnomad.mac-ai</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NOMAD_DIR/mac-ai/venv/bin/python</string>
    <string>$NOMAD_DIR/mac-ai/bin/worker.py</string>
    <string>--model-root</string>
    <string>$NOMAD_DIR/mac-ai/models</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$NOMAD_DIR/storage/logs/mac-ai.log</string>
  <key>StandardErrorPath</key><string>$NOMAD_DIR/storage/logs/mac-ai.err.log</string>
</dict>
</plist>
PLIST

launchctl unload "$plist" >/dev/null 2>&1 || true
launchctl load "$plist"

docker compose -p project-nomad -f "$NOMAD_DIR/compose.yml" up -d

log "Project N.O.M.A.D. is starting at http://localhost:$NOMAD_PORT"
log "Native Mac AI worker is managed by launchd as us.projectnomad.mac-ai."
log "Place MLX model folders or Core ML packages in $NOMAD_DIR/mac-ai/models."
