#!/bin/sh

set -e

if [ -n "${UMASK:-}" ]; then
  umask "$UMASK"
fi

# Optionally drop privileges to PUID:PGID when started as root (e.g. NAS/Unraid setups).
if [ "$(id -u)" -eq 0 ] && [ -z "${_NOMAD_PRIVS_DROPPED:-}" ] && { [ -n "${PUID:-}" ] || [ -n "${PGID:-}" ]; }; then
  TARGET_UID="${PUID:-0}"
  TARGET_GID="${PGID:-0}"
  case "$TARGET_UID:$TARGET_GID" in
    *[!0-9:]*)
      echo "Invalid PUID/PGID: '${PUID:-}' / '${PGID:-}' (expected non-negative integers)" >&2
      exit 1
      ;;
  esac

  if [ "$TARGET_UID" -ne 0 ] || [ "$TARGET_GID" -ne 0 ]; then
    mkdir -p /app/storage/logs /app/storage/kb_uploads
    chown "${TARGET_UID}:${TARGET_GID}" /app/storage /app/storage/logs /app/storage/kb_uploads 2>/dev/null || true
    [ -e /app/storage/logs/admin.log ] && chown "${TARGET_UID}:${TARGET_GID}" /app/storage/logs/admin.log 2>/dev/null || true

    # Preserve access to the local Docker socket group when not using a TCP DOCKER_HOST.
    GROUP_ARGS="--clear-groups"
    SOCK_PATH=""
    case "${DOCKER_HOST:-}" in
      "") SOCK_PATH="/var/run/docker.sock" ;;
      unix://*) SOCK_PATH="${DOCKER_HOST#unix://}" ;;
    esac
    if [ -n "$SOCK_PATH" ] && [ -S "$SOCK_PATH" ]; then
      SOCK_GID="$(stat -c '%g' "$SOCK_PATH" 2>/dev/null || true)"
      if [ -n "$SOCK_GID" ] && [ "$SOCK_GID" -gt 0 ] 2>/dev/null && [ "$SOCK_GID" != "$TARGET_GID" ]; then
        GROUP_ARGS="--groups=${TARGET_GID},${SOCK_GID}"
      fi
    fi

    if [ "${HOME:-}" = "/root" ]; then
      export HOME="/tmp"
    fi

    echo "Dropping privileges to ${TARGET_UID}:${TARGET_GID}..."
    exec env _NOMAD_PRIVS_DROPPED=1 setpriv --reuid="$TARGET_UID" --regid="$TARGET_GID" $GROUP_ARGS "$0" "$@"
  fi
fi

echo "Starting entrypoint script..."

# Ensure required storage directories exist (volume may be freshly mounted)
mkdir -p /app/storage/logs /app/storage/kb_uploads

# Wait for Redis to be reachable before booting anything that opens a BullMQ
# connection. `depends_on: condition: service_healthy` only gates a clean
# `up --recreate`; it is NOT re-checked on `docker compose restart` or a
# `restart: unless-stopped` bounce, so without this the app can race Docker's
# DNS (EAI_AGAIN) or dial a restarted Redis container's stale IP (ECONNREFUSED).
# This isn't load-bearing since legacy installs used a mounted entrypoint script
# that may override this script, but it's a cost-nothing check for newer installs.
# The real check is done by the application itself, but this provides a safety net.
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
echo "Waiting for Redis at ${REDIS_HOST}:${REDIS_PORT}..."
for i in $(seq 1 60); do
  if node -e "const net=require('net');const s=net.connect(Number(process.env.REDIS_PORT||6379),process.env.REDIS_HOST||'redis');let done=false;const finish=(code)=>{if(done)return;done=true;s.destroy();process.exit(code)};s.setTimeout(1000,()=>finish(1));s.on('connect',()=>finish(0));s.on('error',()=>finish(1));" 2>/dev/null; then
    echo "Redis is up and running!"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "Timed out waiting for Redis at ${REDIS_HOST}:${REDIS_PORT}" >&2
    exit 1
  fi
  sleep 1
done

# Run AdonisJS migrations
echo "Running AdonisJS migrations..."
node ace migration:run --force

# Seed the database if needed
echo "Seeding the database..."
node ace db:seed

# Start background workers for all queues
echo "Starting background workers for all queues..."
node ace queue:work --all &

# Start the AdonisJS application
echo "Starting AdonisJS application..."
exec node bin/server.js
