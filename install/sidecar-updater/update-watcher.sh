#!/bin/bash

# Project N.O.M.A.D. Update Sidecar - Polls for update requests and executes them

SHARED_DIR="/shared"
REQUEST_FILE="${SHARED_DIR}/update-request"
STATUS_FILE="${SHARED_DIR}/update-status"
LOG_FILE="${SHARED_DIR}/update-log"
COMPOSE_FILE="/opt/project-nomad/compose.yml"
COMPOSE_PROJECT_NAME="project-nomad"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

write_status() {
    local stage="$1"
    local progress="$2"
    local message="$3"
    
    cat > "$STATUS_FILE" <<EOF
{
  "stage": "$stage",
  "progress": $progress,
  "message": "$message",
  "timestamp": "$(date -Iseconds)"
}
EOF
}

perform_update() {
    log "Update request received - starting system update"
    
    # Clear old logs
    > "$LOG_FILE"
    
    # Stage 1: Starting
    write_status "starting" 0 "System update initiated"
    log "System update initiated"
    sleep 1
    
    # Stage 2: Pulling images
    write_status "pulling" 20 "Pulling latest Docker images..."
    log "Pulling latest Docker images..."
    
    if docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" pull >> "$LOG_FILE" 2>&1; then
        log "Successfully pulled latest images"
        write_status "pulled" 60 "Images pulled successfully"
    else
        log "ERROR: Failed to pull images"
        write_status "error" 0 "Failed to pull Docker images - check logs"
        return 1
    fi
    
    sleep 2
    
    # Stage 3: Recreating containers individually (excluding updater)
    write_status "recreating" 65 "Recreating containers individually..."
    log "Recreating containers individually (excluding updater)..."
    
    # List of services to update (excluding updater)
    SERVICES_TO_UPDATE="admin mysql redis dozzle"
    
    local current_progress=65
    local progress_per_service=8  # (95 - 65) / 4 services ≈ 8% per service
    
    for service in $SERVICES_TO_UPDATE; do
        log "Updating service: $service"
        write_status "recreating" $current_progress "Recreating $service..."
        
        # Stop the service
        log "  Stopping $service..."
        docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" stop "$service" >> "$LOG_FILE" 2>&1 || log "  WARNING: Failed to stop $service"
        
        # Remove the container
        log "  Removing old $service container..."
        docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" rm -f "$service" >> "$LOG_FILE" 2>&1 || log "  WARNING: Failed to remove $service"
        
        # Recreate and start with new image
        log "  Starting new $service container..."
        if docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" up -d --no-deps "$service" >> "$LOG_FILE" 2>&1; then
            log "  ✓ Successfully recreated $service"
        else
            log "  ERROR: Failed to recreate $service"
            write_status "error" $current_progress "Failed to recreate $service - check logs"
            return 1
        fi
        
        current_progress=$((current_progress + progress_per_service))
    done
    
    log "Successfully recreated all containers"
    write_status "complete" 100 "System update completed successfully"
    log "System update completed successfully"
    
    return 0
}

cleanup() {
    log "Update sidecar shutting down"
    exit 0
}

trap cleanup SIGTERM SIGINT

# Main watch loop
log "Update sidecar started - watching for update requests"
write_status "idle" 0 "Ready for update requests"

while true; do
    # Check if an update request file exists
    if [ -f "$REQUEST_FILE" ]; then
        log "Found update request file"
        
        # Read request details (could contain metadata like requester, timestamp, etc.)
        REQUEST_DATA=$(cat "$REQUEST_FILE" 2>/dev/null || echo "{}")
        log "Request data: $REQUEST_DATA"
        
        # Remove the request file to prevent re-processing
        rm -f "$REQUEST_FILE"
        
        if perform_update; then
            log "Update completed successfully"
        else
            log "Update failed - see logs for details"
        fi
        
        sleep 5
        write_status "idle" 0 "Ready for update requests"
    fi
    
    # Sleep before next check (1 second polling)
    sleep 1
done
