# World Offline worker

The optional worker downloads the selected NASA Blue Marble or VersaTiles source directly and prepares PMTiles locally. The container image includes the conversion tools and Python runtime. Once the prepared archives have been published, the admin can render them from disk even while the worker has no provider access.

## Build and run

Build this directory for Linux AMD64 or ARM64. The image uses a pinned Debian-based Python image, hashed Python wheels from PyPI and checked release artifacts for the two conversion tools. [go-pmtiles release](https://github.com/protomaps/go-pmtiles/releases/tag/v1.30.2) · [VersaTiles release](https://github.com/versatiles-org/versatiles-rs/releases/tag/v5.12.0)

```sh
docker build -t nomad-world-offline-worker:local ./world-offline-worker
```

Attach the service to the private Docker network used by NOMAD and give it outgoing HTTPS access to the map providers for downloads. Leave port 8083 unpublished. Use one bind mount of the admin's host `storage/maps` directory at `/data/maps` so the worker publishes to the same archive directory that the admin reads. The default process is UID/GID 65532. Grant that identity access to the two worker directories, or select a compatible non-root identity in the deployment.

| Worker setting | Default |
| --- | --- |
| `WORLD_MAPS_DIR` | `/data/maps/pmtiles` |
| `WORLD_STATE_DIR` | `/data/maps/.world-offline` |
| `WORLD_WORKER_HOST` | `0.0.0.0` inside the container |
| `WORLD_WORKER_PORT` | `8083` inside the container |
| `WORLD_PMTILES_BIN` | `/usr/local/bin/pmtiles` |
| `WORLD_VERSATILES_BIN` | `/usr/local/bin/versatiles` |

Configure a single shared random token of at least 32 bytes between the admin's `WORLD_OFFLINE_WORKER_TOKEN` and the worker's `WORLD_WORKER_TOKEN` or `WORLD_WORKER_TOKEN_FILE`. The container accepts `X-Nomad-World-Token` and the compatibility header `X-Nomad-Lab-Token` on its internal routes. The admin talks to the worker's private service URL through `WORLD_OFFLINE_WORKER_URL`. `GET /health` only reports that the internal endpoint is reachable.

Maps and worker state must be separate writable directories under the same bind mount. The worker verifies hard-link publication at startup. Store both directories on persistent storage to preserve the installed inventory and saved download ranges through restarts.

## Catalog and existing installations

Regenerate the admin's fallback catalog from the worker when changing pack IDs, estimates or source profiles. This command uses Python's standard library and does not fetch data.

```sh
python3 world-offline-worker/export_catalog.py > admin/resources/world-offline/catalog.json
```

Package IDs, the version 1 `lab-world-archive-manifest.json` layout, archive filenames and checkpoint names remain compatible with the laboratory installation. Move existing world archives together with that manifest. Existing in-flight downloads retain their checkpoints when the worker's state directory is migrated too. Keep the original data while validating a copy and stop the old writer before pointing the container at the same storage.

New records retain the output digest, source URLs and byte counts. VersaTiles records save the provider ETag when present and the SHA-256 of the repacked local range index. Blue Marble records list the NASA files by month and expected file sizes. These are distinct from provider-published checksums. The worker prepares only the requested zooms or resolution. [NASA Blue Marble](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/) · [VersaTiles datasets](https://docs.versatiles.org/basics/tilesets.html)

## Test locally

Build the image once, then run the synthetic fixtures from the repository root with networking disabled. The tests cover authenticated local requests, archive reduction and retirement, checkpoint cleanup, inventory recovery after a restart, and retry after a simulated disk-full error. They use temporary data outside the real map directory.

```sh
docker run --rm -i --network none --entrypoint python nomad-world-offline-worker:local - < world-offline-worker/test_worker.py
```
