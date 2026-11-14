#!/bin/bash

echo "Finding Project NOMAD containers..."

# -a to include all containers (running and stopped)
if ! containers=$(docker ps -a --filter "name=^nomad_" --format "{{.Names}}"); then
    echo "Failed to list Project NOMAD containers." >&2
    exit 1
fi

if [ -z "$containers" ]; then
    echo "No containers found for Project NOMAD Is it installed?"
    exit 0
fi

echo "Found the following containers:"
echo "$containers"
echo ""

status=0
for container in $containers; do
    echo "Starting container: $container"
    if docker start "$container"; then
        echo "✓ Successfully started $container"
    else
        echo "✗ Failed to start $container" >&2
        status=1
    fi
    echo ""
done

if [ "$status" -ne 0 ]; then
    exit "$status"
fi

echo "Finished initiating start of all Project NOMAD containers."
