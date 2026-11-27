# Enable regional offline maps from source

Regional downloads and the native-detail indicator are optional. They reuse the existing **World offline** downloader. The standard installation and the World offline overlay keep their existing behavior until this extra overlay is loaded.

Use a checkout containing this feature and an existing NOMAD installation on Linux, or run the commands inside its WSL distribution on Windows. Use Linux paths and Docker from that same distribution. The initial image builds and new map acquisitions need internet access; installed maps, contour rendering, recovery from complete saved data and local storage management use local files.

## Storage layout

Keep the existing host storage path and deployed management Compose file. Do not replace the installed Compose file with the repository template: the installed file contains your database settings and application key.

The regional extension adds only this separate sibling directory:

```text
<existing NOMAD storage>/
  maps/                   existing maps and World offline files
  local-detail/
    pmtiles/              verified regional archives and their inventory
    .state/               private preparation, queue and recovery state
```

The downloader runs as UID/GID **65532:65532**. Both regional subdirectories must be on the same Linux filesystem and mount. Store these files inside the WSL Linux filesystem when Windows-mounted directories do not support the required Unix ownership, modes and hard links.

The regional directory is mounted read-only in the admin at `/app/local-detail`. A second read-only mount masks `/app/storage/local-detail`, so the original writable storage mount cannot provide another writable path to the same regional files. The original `/app/storage` mount stays writable for **Choose Countries**, ZIM files and other existing tools. Only the downloader receives the regional directory writable.

## Build and configure

From the checkout root, build an admin image containing the feature:

```sh
docker build -t nomad-world-admin:regional .
```

Set the following values in the shell used for Compose, or in a private Compose environment file outside the checkout. Persist them for future restarts and keep that file out of reports and version control. Generate `WORLD_OFFLINE_TOKEN` with a cryptographically random generator, for example `openssl rand -hex 32`; use the same token for the existing World offline configuration.

```text
NOMAD_WORLD_ADMIN_IMAGE=nomad-world-admin:regional
NOMAD_STORAGE_PATH=/absolute/existing/nomad/storage
NOMAD_WORLD_WORKER_CONTEXT=/absolute/checkout/world-offline-worker
WORLD_OFFLINE_TOKEN=<private random token of at least 32 printable ASCII bytes>
```

The worker context must be absolute. Compose resolves relative paths from its first Compose file, which can be the installed file in a different directory. `NOMAD_STORAGE_PATH` must exactly match the existing `/app/storage` bind and the admin's existing storage fallback setting. These variables do not relocate or copy existing data.

The original World offline storage must already be prepared as described in the [World offline operator notes](/docs/world-offline-maintainers): `maps/pmtiles` and `maps/.world-offline` must be writable by the worker. Do not recursively change ownership of an existing content library. Review existing directory permissions rather than changing installed map files automatically.

Use these three files in this order:

1. Your existing installed management Compose file.
2. `install/world_offline_compose.yaml` from this checkout.
3. `install/regional_maps_compose.yaml` from this checkout.

For example, set shell variables to the paths appropriate to your installation:

```sh
nomad_checkout=/absolute/checkout
nomad_management=/absolute/existing/nomad/compose.yml
nomad_maps_env=/absolute/private/world-offline.env

sudo python3 "$nomad_checkout/install/prepare_regional_maps.py" \
  --storage /absolute/existing/nomad/storage --prepare \
  --env-file "$nomad_maps_env" \
  --compose "$nomad_management" \
  --compose "$nomad_checkout/install/world_offline_compose.yaml" \
  --compose "$nomad_checkout/install/regional_maps_compose.yaml"
```

The preflight validates the merged configuration in memory without printing or saving tokens. It creates or adjusts ownership and modes only on `local-detail`, `local-detail/pmtiles` and `local-detail/.state`; it never opens existing map archives or changes the legacy library's permissions. A validation failure stops before directory preparation. Run it again without `--prepare` to check the prepared layout.

Then build the shared worker and update only the two map services:

```sh
docker compose --env-file "$nomad_maps_env" \
  -f "$nomad_management" \
  -f "$nomad_checkout/install/world_offline_compose.yaml" \
  -f "$nomad_checkout/install/regional_maps_compose.yaml" \
  build world-offline-worker

docker compose --env-file "$nomad_maps_env" \
  -f "$nomad_management" \
  -f "$nomad_checkout/install/world_offline_compose.yaml" \
  -f "$nomad_checkout/install/regional_maps_compose.yaml" \
  up -d --no-deps admin world-offline-worker
```

Keep the same Compose file order and environment on subsequent starts. The admin reads `LOCAL_DETAIL_ENABLED=true`, `MAP_DETAIL_INDICATOR_ENABLED=true`, and the shared private worker URL and token from the overlay. The worker remains in combined mode; it has no published host port. No second downloader service is required.

## Verify and disable

Open **Settings → Maps** and check **Regional offline maps**. `/api/maps/local-detail` should report `serviceUnavailable` as absent/false and an empty `cells` array before the first regional download. The existing worldwide packages and **Choose Countries** remain in their original sections. The [regional user guide](/docs/local-detail) explains selections, queue recovery, storage controls and deletion. The [map detail guide](/docs/map-detail) explains native zoom and mixed detail.

After installing a small region, restart the admin and worker, disconnect internet access, then open the region and its contours. The installed inventory and map reading also work when the downloader is stopped; preparation and storage mutations require the local worker to be running.

To hide the regional panel and indicator, remove the regional overlay and recreate only the admin and worker with the first two files. Keep the regional directory and its complete matching inventory for later re-enablement. To reclaim installed regions, use the panel's confirmed **Delete** action before disabling it. Removing an overlay does not delete map data.

## Maintainer verification

```sh
python3 install/tests/regional_maps_provision_test.py
NOMAD_REGIONAL_FIXTURE_IMAGE=<locally built worker image> \
  python3 install/tests/regional_maps_provision_test.py
```

The first command checks filesystem safety and merges the committed Compose files when Docker is available. The second adds an empty combined-worker startup with network disabled and no user data mounted. It verifies both regional admin aliases are read-only while the original storage path remains writable. Fixtures are created in a temporary directory and contain no downloaded maps or production credentials.

To verify a complete clean admin installation, use locally built source images with the separate integration fixture:

```sh
sudo python3 install/tests/regional_maps_clean_install.py prepare \
  --state-dir /opt/nomad-regional-clean-test \
  --admin-image nomad-world-admin:regional \
  --worker-image <locally built worker image> --port 8085
sudo python3 install/tests/regional_maps_clean_install.py start \
  --state-dir /opt/nomad-regional-clean-test
sudo python3 install/tests/regional_maps_clean_install.py stop \
  --state-dir /opt/nomad-regional-clean-test
```

This fixture selects only admin, MySQL, Redis and the shared worker from the three committed Compose files, with synthetic credentials and independent storage. It runs the committed entrypoint's migrations and seed against a new empty database. No database dump, production configuration, downloaded map or Docker socket is mounted. A tiny generated empty basemap lets the real map pages open without acquisition. The network is internal, no container port is published, and a guarded local relay exposes only the chosen test port. The fixture records its configuration changes and verification in its dedicated state directory; `stop` retains that directory for inspection. Use its existing `verify` command to repeat read-only checks, then check **Choose Countries**, the regional panel and map detail indicator from a fresh browser profile before stopping it.
