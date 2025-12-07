#!/bin/sh

set -e

echo "Starting entrypoint script..."
echo "Running wait-for-it.sh to ensure MySQL is ready..."

# Use wait-for-it.sh to wait for MySQL to be available
# wait-for-it.sh <host>:<port> [-t timeout] [-- command args]
/usr/local/bin/wait-for-it.sh ${DB_HOST}:${DB_PORT} -t 60 -- echo "MySQL is up and running!"

# Run AdonisJS migrations
echo "Running AdonisJS migrations..."
node ace migration:run --force

# Seed the database if needed
echo "Seeding the database..."
node ace db:seed

# Start background worker for queues
echo "Starting background worker for queues..."
node ace queue:work --queue=downloads &

# Start the AdonisJS application
echo "Starting AdonisJS application..."
exec node bin/server.js