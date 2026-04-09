# Project N.O.M.A.D. — About the Disk Collector Migration Script

This script migrates your Project N.O.M.A.D. installation from the old host-based disk info collector to the new disk-collector sidecar. It modifies `/opt/project-nomad/compose.yml` to add the new service and remove the old bind mount, then restarts the full compose stack to apply the changes.

### Why the Migration?
The new disk-collector sidecar provides a more robust and scalable way to collect disk information from the host. It removes the original bind mount to `/tmp/nomad-disk-info.json`, which was fragile and prone to issues on host reboots.

The original host-based collector relied on a process running on the host that wrote disk info to a file, which was then read by the admin container via a bind mount. This approach had several drawbacks:
- The host process could fail or be killed, leading to stale or missing disk info.
- The bind mount to `/tmp/nomad-disk-info.json` was cleared on host reboots, causing Docker to create a directory at the mount point instead of a file.
- Necessitated a tighter coupling to the host, which would make more flexible future deployment options tougher to achieve.

The migration script automates the necessary changes to your compose configuration and ensures a smooth transition to the new architecture.

### Why does Nomad need the nomad-disk-info.json file?
Nomad uses the disk info stored and updated in `nomad-disk-info.json` to allow users to view disk usage and availability within the Nomad "Command Center". While not critical to the core functionality of Nomad, it provides a more pleasant experience for users with limited storage space and/or who aren't familiar with command-line tools and Linux management.

### Why a separate container?
The disk-collector runs in a separate container to isolate its functionality from the main admin container. This separation provides several benefits:
- **Stability**: If the disk-collector encounters an issue or crashes, it won't affect the main admin container and vice versa.
- **Security**: The main admin container already has significant host access via the Docker socket, storage directory, and host.docker.internal. Additionally, Nomad may add more features in the future that support multi-user environments and/or more network exposure, so isolating the disk-collector reduces the exposure of the host filesystem (even if read-only) to just the one container, which has a very limited scope of functionality and access.
- **Modularity**: Because having the host disk info is not a critical component of Nomad's core functionality, isolating it in a sidecar allows users who don't need/want the disk info features to simply not run that container, without impacting the main admin container or other services. It also allows for more flexible future development of the disk-collector without needing to modify the main admin container.

### What if I don't want to run the migration script?
No worries - you can replicate the changes manually by editing your `/opt/project-nomad/compose.yml` to add the new disk-collector service and remove the old bind mount from the admin service, then restarting your compose stack. The migration script just automates these steps and ensures they're done correctly, but the underlying changes are straightforward if you prefer to do it yourself. Just be sure to back up your `compose.yml` before making any changes.

Here's the disk-collector service configuration to add to your `compose.yml`:

```yml
  disk-collector:
    image: ghcr.io/flynnty/project-nomad-disk-collector:latest
    pull_policy: always
    container_name: nomad_disk_collector
    restart: unless-stopped
    volumes:
      - /:/host:ro,rslave  # Read-only view of host FS with rslave propagation so /sys and /proc submounts are visible
      - /opt/project-nomad/storage:/storage
```

and remove the `- /tmp/nomad-disk-info.json:/app/storage/nomad-disk-info.json` bind mount from the admin service volumes.