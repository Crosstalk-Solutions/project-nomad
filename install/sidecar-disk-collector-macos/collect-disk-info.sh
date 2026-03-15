#!/bin/bash

# Project N.O.M.A.D. - Disk Info Collector Sidecar (macOS-compatible)
#
# On macOS with Docker Desktop, the container cannot directly access host disk info
# via /proc or lsblk. Instead, this collector provides basic filesystem info using
# standard df inside the container, which reflects Docker's virtual disk.
# Runs continually and updates the JSON data every 2 minutes.

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

log "disk-collector sidecar starting (macOS mode)..."

if [[ ! -f /storage/nomad-disk-info.json ]]; then
    echo '{"diskLayout":{"blockdevices":[]},"fsSize":[]}' > /storage/nomad-disk-info.json
    log "Created initial placeholder — will be replaced after first collection."
fi

while true; do
    # On macOS/Docker Desktop, we can't access host block devices directly.
    # Provide an empty block device layout.
    DISK_LAYOUT='{"blockdevices":[]}'

    # Collect filesystem info from df inside the container
    FS_JSON="["
    FIRST=1
    while IFS= read -r line; do
        # Parse df output: Filesystem Size Used Avail Use% Mounted
        dev=$(echo "$line" | awk '{print $1}')
        size=$(echo "$line" | awk '{print $2}')
        used=$(echo "$line" | awk '{print $3}')
        avail=$(echo "$line" | awk '{print $4}')
        pct=$(echo "$line" | awk '{print $5}' | tr -d '%')
        mount=$(echo "$line" | awk '{print $6}')

        # Skip pseudo filesystems
        [[ "$dev" == "tmpfs" || "$dev" == "devtmpfs" || "$dev" == "shm" || "$dev" == "none" ]] && continue
        [[ -z "$size" || "$size" == "0" ]] && continue

        [[ "$FIRST" -eq 0 ]] && FS_JSON+=","
        FS_JSON+="{\"fs\":\"${dev}\",\"size\":${size},\"used\":${used},\"available\":${avail},\"use\":${pct},\"mount\":\"${mount}\"}"
        FIRST=0
    done < <(df -B1 2>/dev/null | tail -n +2 || df -k 2>/dev/null | tail -n +2)
    FS_JSON+="]"

    cat > /storage/nomad-disk-info.json.tmp << EOF
{
"diskLayout": ${DISK_LAYOUT},
"fsSize": ${FS_JSON}
}
EOF

    if mv /storage/nomad-disk-info.json.tmp /storage/nomad-disk-info.json; then
        log "Disk info updated successfully."
    else
        log "ERROR: Failed to move temp file to /storage/nomad-disk-info.json"
    fi

    sleep 120
done
