#!/bin/bash

# Project N.O.M.A.D. - Disk Info Collector Sidecar
#
# Reads host block device and filesystem info via the /:/host:ro,rslave bind-mount.
# No special capabilities required. Writes JSON to /storage/nomad-disk-info.json, which is read by the admin container.
# Runs continually and updates the JSON data every 2 minutes.

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

log "disk-collector sidecar starting..."

while true; do

    # Get disk layout
    DISK_LAYOUT=$(lsblk --sysroot /host --json -o NAME,SIZE,TYPE,MODEL,SERIAL,VENDOR,ROTA,TRAN 2>/dev/null)
    if [[ -z "$DISK_LAYOUT" ]]; then
        log "WARNING: lsblk --sysroot /host failed, using empty block devices"
        DISK_LAYOUT='{"blockdevices":[]}'
    fi

    # Get filesystem usage by parsing /host/proc/mounts and running df on each mountpoint
    FS_JSON="["
    FIRST=1
    while IFS=' ' read -r dev mountpoint fstype opts _rest; do
        # Disregard pseudo and virtual filesystems
        [[ "$fstype" =~ ^(tmpfs|devtmpfs|squashfs|sysfs|proc|devpts|cgroup|cgroup2|overlay|nsfs|autofs|hugetlbfs|mqueue|pstore|fusectl|binfmt_misc)$ ]] && continue
        [[ "$mountpoint" == "none" ]] && continue

        STATS=$(df -B1 "/host${mountpoint}" 2>/dev/null | awk 'NR==2{print $2,$3,$4,$5}')
        [[ -z "$STATS" ]] && continue

        read -r size used avail pct <<< "$STATS"
        pct="${pct/\%/}"

        [[ "$FIRST" -eq 0 ]] && FS_JSON+=","
        FS_JSON+="{\"fs\":\"${dev}\",\"size\":${size},\"used\":${used},\"available\":${avail},\"use\":${pct},\"mount\":\"${mountpoint}\"}"
        FIRST=0
    done < /host/proc/mounts
    FS_JSON+="]"

    # Use a tmp file for atomic update
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
