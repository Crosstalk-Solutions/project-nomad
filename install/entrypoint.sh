#!/bin/sh

set -e

echo "============================================"
echo "  Project N.O.M.A.D. — Homelab Edition"
echo "  Starting up..."
echo "============================================"

# ---------------------------------------------------------------------------
# Wait for database to be ready (no external dependencies like wait-for-it.sh)
# ---------------------------------------------------------------------------
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
MAX_RETRIES=60
RETRY_INTERVAL=2

echo "Waiting for database at ${DB_HOST}:${DB_PORT}..."
retries=0
while [ $retries -lt $MAX_RETRIES ]; do
  if curl -sf "http://${DB_HOST}:${DB_PORT}" >/dev/null 2>&1 || \
     node -e "const net = require('net'); const s = new net.Socket(); s.setTimeout(2000); s.connect(${DB_PORT}, '${DB_HOST}', () => { s.destroy(); process.exit(0); }); s.on('error', () => process.exit(1)); s.on('timeout', () => { s.destroy(); process.exit(1); });" 2>/dev/null; then
    echo "Database is ready!"
    break
  fi
  retries=$((retries + 1))
  echo "  Waiting for database... (attempt ${retries}/${MAX_RETRIES})"
  sleep $RETRY_INTERVAL
done

if [ $retries -eq $MAX_RETRIES ]; then
  echo "ERROR: Database did not become ready in time. Continuing anyway..."
fi

# ---------------------------------------------------------------------------
# Ensure storage directories exist
# ---------------------------------------------------------------------------
STORAGE_PATH="${NOMAD_STORAGE_PATH:-/app/storage}"
echo "Ensuring storage directories exist at ${STORAGE_PATH}..."
mkdir -p "${STORAGE_PATH}" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Run database migrations
# ---------------------------------------------------------------------------
echo "Running database migrations..."
node ace migration:run --force

# ---------------------------------------------------------------------------
# Seed the database
# ---------------------------------------------------------------------------
echo "Seeding the database..."
node ace db:seed

# ---------------------------------------------------------------------------
# Start background workers (only if not running as a dedicated worker)
# ---------------------------------------------------------------------------
if [ "${NOMAD_ROLE}" != "worker" ]; then
  echo "Starting background workers for all queues..."
  node ace queue:work --all &
fi

# ---------------------------------------------------------------------------
# Start the application
# ---------------------------------------------------------------------------
echo "============================================"
echo "  N.O.M.A.D. is ready!"
echo "  Listening on port ${PORT:-8080}"
echo "============================================"
exec node bin/server.js