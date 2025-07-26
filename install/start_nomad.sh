#!/bin/bash

echo "Finding Project N.O.M.A.D containers..."

# -a to include all containers (running and stopped)
containers=$(docker ps -a --filter "name=^nomad_" --format "{{.Names}}")

if [ -z "$containers" ]; then
    echo "No containers found for Project N.O.M.A.D. Is it installed?"
    exit 0
fi

echo "Found the following containers:"
echo "$containers"
echo ""

for container in $containers; do
    echo "Starting container: $container"
    if docker start "$container"; then
        echo "✓ Successfully started $container"
    else
        echo "✗ Failed to start $container"
    fi
    echo ""
done

echo "Finished initiating start of all Project N.O.M.A.D containers."
