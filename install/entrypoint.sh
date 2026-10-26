#!/bin/sh

set -e

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

# Guard against silently starting over on an empty database. If the MySQL data path goes
# missing (e.g. a bind mount that Docker recreated as an empty folder), MySQL initializes a
# brand-new database and migrations + seeds would make it look like a fresh install. The marker
# lives in storage and is written after the first successful migrate + seed; if it exists but the
# services table is missing or empty, the database is not the one this install was using.
# No marker = first run (or an install from before this check), so proceed normally.
INIT_MARKER=/app/storage/.nomad-initialized
if [ -f "$INIT_MARKER" ]; then
  echo "Checking that the existing database is present..."
  for i in $(seq 1 30); do
    # Exit codes: 0 = services has rows, 2 = table missing or empty, 1 = could not query (retry).
    db_check=0
    node - <<'EOF' || db_check=$?
const mysql = require('mysql2/promise')
;(async () => {
  let conn
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    })
    const [rows] = await conn.query('SELECT COUNT(*) AS n FROM services')
    process.exitCode = Number(rows[0].n) > 0 ? 0 : 2
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') { process.exitCode = 2 }
    else { console.error('Database check failed: ' + (err && err.message)); process.exitCode = 1 }
  } finally {
    if (conn) await conn.end().catch(() => {})
  }
})()
EOF
    if [ "$db_check" -eq 0 ]; then
      break
    fi
    if [ "$db_check" -eq 2 ]; then
      echo "ERROR: This install was initialized before ($INIT_MARKER exists) but the database is empty." >&2
      echo "ERROR: The MySQL data directory is probably missing or not mounted (check the mysql volume path in compose.yml)." >&2
      echo "ERROR: Refusing to migrate and seed a fresh database over it. Restore the data directory, or delete" >&2
      echo "ERROR: $INIT_MARKER (in the storage folder on the host) if you really want to start from scratch." >&2
      exit 1
    fi
    if [ "$i" -eq 30 ]; then
      echo "Timed out checking the database" >&2
      exit 1
    fi
    sleep 1
  done
fi

# Run AdonisJS migrations
echo "Running AdonisJS migrations..."
node ace migration:run --force

# Seed the database if needed
echo "Seeding the database..."
node ace db:seed

# Record that this install has a populated database (see the guard above).
[ -f "$INIT_MARKER" ] || touch "$INIT_MARKER"

# Start background workers for all queues, restarting them if they exit so jobs never stop silently.
echo "Starting background workers for all queues..."
(
  while true; do
    worker_code=0
    node ace queue:work --all || worker_code=$?
    echo "Queue worker exited with code ${worker_code}; restarting in 5 seconds..." >&2
    sleep 5
  done
) &

# Start the AdonisJS application
echo "Starting AdonisJS application..."
exec node bin/server.js
