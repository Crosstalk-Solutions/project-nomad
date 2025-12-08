#!/bin/bash

while true; do
    DISK_LAYOUT=$(lsblk --json -o NAME,SIZE,TYPE,MODEL,SERIAL,VENDOR,ROTA,TRAN)

    # Get filesystem usage excluding pseudo filesystems
    FS_SIZE=$(df -B1 -x tmpfs -x devtmpfs -x squashfs | tail -n +2 | \
    awk 'BEGIN {print "["} 
        {
            if (NR > 1) printf ","
            gsub(/%/, "", $5)
            printf "{\"fs\":\"%s\",\"size\":%s,\"used\":%s,\"available\":%s,\"use\":%s,\"mount\":\"%s\"}", 
                    $1, $2, $3, $4, $5, $6
        } 
        END {print "]"}')

    cat > /tmp/nomad-disk-info.json << EOF
{
"diskLayout": $DISK_LAYOUT,
"fsSize": $FS_SIZE
}
EOF

    sleep 300
done