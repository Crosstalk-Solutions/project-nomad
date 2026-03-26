#!/bin/sh

set -e

echo "Starting entrypoint script..."

# Ensure required storage directories exist (volume may be freshly mounted)
mkdir -p /app/storage/logs /app/storage/kb_uploads

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
    # Wait for DNS resolution (Debian dhcpcd race condition)
    until ping -c1 8.8.8.8 >/dev/null 2>&1 || ping -c1 google.com >/dev/null 2>&1 || [ $SECONDS -gt 10 ]; do sleep 1; done

exec node bin/server.js