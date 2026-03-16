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

# Write a valid placeholder immediately so admin has something to parse if the
# file is missing (first install, user deleted it, etc.). The real data from the
# first full collection cycle below will overwrite this within seconds.
if [[ ! -f /storage/nomad-disk-info.json ]]; then
    echo '{"diskLayout":{"blockdevices":[]},"fsSize":[]}' > /storage/nomad-disk-info.json
    log "Created initial placeholder — will be replaced after first collection."
fi

while true; do

    # Get disk layout (-b outputs SIZE in bytes as a number rather than a human-readable string)
    DISK_LAYOUT=$(lsblk --sysroot /host --json -b -o NAME,SIZE,TYPE,MODEL,SERIAL,VENDOR,ROTA,TRAN 2>/dev/null)
    if [[ -z "$DISK_LAYOUT" ]]; then
        log "WARNING: lsblk --sysroot /host failed, using empty block devices"
        DISK_LAYOUT='{"blockdevices":[]}'
    fi

    # Get filesystem usage by parsing /host/proc/1/mounts (PID 1 = host init = root mount namespace)
    # /host/proc/mounts is a symlink to /proc/self/mounts, which always reflects the CURRENT
    # process's mount namespace (the container's), not the host's. /proc/1/mounts reflects the
    # host init process's namespace, giving us the true host mount table.
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
    done < /host/proc/1/mounts

    # Fallback: if no real filesystems were found from the host mount table
    # (e.g. /host/proc/1/mounts was unreadable), try the /storage mount directly.
    # The disk-collector container always has /storage bind-mounted from the host,
    # so df on /storage reflects the actual backing device and its capacity.
    if [[ "$FIRST" -eq 1 ]] && mountpoint -q /storage 2>/dev/null; then
        STATS=$(df -B1 /storage 2>/dev/null | awk 'NR==2{print $1,$2,$3,$4,$5}')
        if [[ -n "$STATS" ]]; then
            read -r dev size used avail pct <<< "$STATS"
            pct="${pct/\%/}"
            FS_JSON+="{\"fs\":\"${dev}\",\"size\":${size},\"used\":${used},\"available\":${avail},\"use\":${pct},\"mount\":\"/storage\"}"
            FIRST=0
            log "Used /storage mount as fallback for filesystem info."
        fi
    fi

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
