#!/bin/bash

echo "Finding running Docker containers for Project NOMAD.."

if ! containers=$(docker ps --filter "name=^nomad_" --format "{{.Names}}"); then
    echo "Failed to list Project NOMAD containers." >&2
    exit 1
fi

if [ -z "$containers" ]; then
    echo "No running containers found for Project NOMAD"
    exit 0
fi

echo "Found the following running containers:"
echo "$containers"
echo ""

status=0
for container in $containers; do
    echo "Gracefully stopping container: $container"
    if docker stop "$container"; then
        echo "✓ Successfully stopped $container"
    else
        echo "✗ Failed to stop $container" >&2
        status=1
    fi
    echo ""
done

if [ "$status" -ne 0 ]; then
    exit "$status"
fi

echo "Finished initiating graceful shutdown of all Project NOMAD containers."
