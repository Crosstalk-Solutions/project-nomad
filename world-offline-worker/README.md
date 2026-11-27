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
| `WORLD_HOST_DISK` | Unset. Set to a mounted host filesystem, such as `/mnt/c` on WSL, to cap available workspace by its free space. |

Configure a single shared random token of at least 32 bytes between the admin's `WORLD_OFFLINE_WORKER_TOKEN` and the worker's `WORLD_WORKER_TOKEN` or `WORLD_WORKER_TOKEN_FILE`. The container accepts `X-Nomad-World-Token` and the compatibility header `X-Nomad-Lab-Token` on its internal routes. The admin talks to the worker's private service URL through `WORLD_OFFLINE_WORKER_URL`. `GET /health` only reports that the internal endpoint is reachable.

Maps and worker state must be separate writable directories under the same bind mount. The worker verifies hard-link publication at startup. Store both directories on persistent storage to preserve the installed inventory and saved download ranges through restarts.

## Catalog and existing installations

Regenerate the admin's fallback catalog from the worker when changing pack IDs, estimates or source profiles. This command uses Python's standard library and does not fetch data.

```sh
python3 world-offline-worker/export_catalog.py > admin/resources/world-offline/catalog.json
```

Package IDs, the version 1 `lab-world-archive-manifest.json` layout, archive filenames and checkpoint names remain compatible with the laboratory installation. Move existing world archives together with that manifest. Existing in-flight downloads retain their checkpoints when the worker's state directory is migrated too. Keep the original data while validating a copy and stop the old writer before pointing the container at the same storage.

New records retain the output digest, source URLs and byte counts. VersaTiles records save the provider ETag when present and the SHA-256 of the repacked local range index. Blue Marble records list the NASA files by month and expected file sizes. These are distinct from provider-published checksums. The worker prepares only the requested zooms or resolution. [NASA Blue Marble](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/) · [VersaTiles datasets](https://docs.versatiles.org/basics/tilesets.html)

Elevation stores the base levels z0–6 in one archive and subsequent levels z7–12 in individual archives. An upgrade retains the installed bands and transfers the added bands. The range plan validates the provider's Terrarium metadata before fetching the selected blocks. The PMTiles conversion preserves the encoded WebP tile bytes. Published Elevation archives declare 512-pixel tiles and the Terrarium encoding for automatic 100 m contours in the 2D Topography layer. [VersaTiles Elevation](https://docs.versatiles.org/basics/tilesets.html#elevation) · [Mapterhorn attribution](https://mapterhorn.com/attribution/)

## Test locally

Build the image once, then run the synthetic fixtures from the repository root with networking disabled. The tests cover authenticated local requests, archive reduction and retirement, checkpoint cleanup, inventory recovery after a restart, and retry after a simulated disk-full error. Elevation fixtures verify byte-preserving conversion and incremental upgrade and downgrade. They use temporary data outside the real map directory.

```sh
docker run --rm -i --network none --entrypoint python nomad-world-offline-worker:local - < world-offline-worker/test_worker.py
```

## Independent local-detail packages

The NOMAD2 local-detail extension uses fixed XYZ zoom-8 cells. Each cell contains Satellite, Earth Relief and Terrarium Elevation through native zoom 12, plus the Protomaps Street data through native zoom 15. Blue Marble and the worldwide package inventory are separate. Cell sizes vary with latitude; cell identifiers use stable Excel-style column letters and row numbers.

Run the same image with `WORLD_WORKER_LOCAL_ONLY=true`, `LOCAL_DETAIL_MAPS_DIR=/data/local-detail/pmtiles` and `LOCAL_DETAIL_STATE_DIR=/data/local-detail/.state` to enable only this extension. Mount both directories under one writable persistent `/data/local-detail` mount. The image never needs writable access to the existing worldwide maps in this mode. Authentication, private port, non-root identity and `WORLD_HOST_DISK` behave as documented above. Optional `LOCAL_DETAIL_STREET_SOURCE` points to a read-only, already installed Protomaps PMTiles file with native zoom 15; without it, the worker uses the same official Protomaps build catalog as NOMAD. It chooses a recent available dated build and pins its URL and strong ETag in the quote. Up to three recent builds and the previously verified public build can be tried when a provider removes a dated file. No source URL can be supplied by an API caller.

The internal endpoint is `GET /api/lab-imagery/local-detail`. Its `cells` array advertises a square only after all four PMTiles archives pass conversion and structural verification and the manifest is atomically committed. The admin can read `pmtiles/local-detail-manifest.json` while the worker is stopped. Do not merge this manifest into `lab-world-archive-manifest.json`.

`POST .../calculate` accepts `{"cells":[{"x":41,"y":93}]}`. It reads public directory metadata and plans exact tile ranges rather than entire source blocks. The response includes each cell's source payload bytes, estimated installed size, available workspace and an opaque `quoteId`. The source ETags are pinned in that saved quote. A quote expires after 24 hours. A changed source requires a new calculation.

`POST .../download` accepts the same `cells`, `quoteId` and an optional `requestId`. Removing quoted cells is allowed; adding an unquoted cell requires a new calculation. A request is bounded to 64 cells to limit API work; installed storage has no fixed byte ceiling. Disk capacity is checked before preparation. Required workspace includes sources, conversion files and prepared archives, and can exceed the final installed size.

`POST .../cancel` and `POST .../retry` accept `{"id":"job-id"}`. Queued, downloading, preparing, verifying, ready, failed and cancelled states are persisted. Received transfer bytes and current transfer speed are distinct from verified/resumed range progress. After an interrupted restart the task reports a failure with a Retry explanation instead of pretending it is still transferring. Completed cells remain usable if a later cell fails. Failed or cancelled tasks keep validated source-range checkpoints for Retry; completed tasks remove their duplicate range files. Temporary conversion files are private to this worker and are cleaned separately from installed maps.

`POST .../delete` accepts `{"cells":[{"x":41,"y":93}]}` (1–64). It is entirely local and never fetches provider metadata. A running task or still-alive thread returns 409, including after Cancel. The worker validates exact regional filenames and regular, non-symlink storage, atomically removes selected inventory entries while recording cleanup tombstones, then unlinks only their owned archives using a checked directory descriptor. No recursive deletion is performed. Worldwide files, unselected cells and Pins are outside its ownership.

The deletion result contains `removed`, `alreadyAbsent`, `freedBytes`, `cleanupPending`, `generation` and `job`. A 200 response with `cleanupPending` needs a visible warning and retry; repeating the same cells safely finishes cleanup. Snapshot also reports pending coordinates, and startup retries recorded cleanup offline. Old quotes are invalidated, intersecting terminal jobs are cleared, and a square with unfinished cleanup cannot be reinstalled. Symlinks or malformed ownership fail safely without unlinking any selected archive; storage failures before the inventory commit preserve the files.

The offline fixture suite checks selection bounds, half-open cell edges, range planning, source directories, partial publication failures, subset quotes, disk checks, restart recovery, HTTP Range reuse, all four conversion formats, deletion ownership and symlink protection, interrupted cleanup and concurrent cancellation/publication. Run it in the Linux worker image with networking disabled (directory descriptors and no-follow filesystem semantics require Linux):

```sh
# Mount the source tests read-only or copy them into a temporary image.
python -m unittest -v test_local_detail
```

### Persistent regional queues, recovery and cleanup

The panel calculates at most 64 squares per request, then submits `POST .../queue` with reviewed `batches: [{quoteId, excludedCells?: ["8/x/y"]}]` and a stable optional `requestId`. All estimates and available disk space are checked before one persistent admission commit. Up to 1024 UI batches cover the finite z8 grid; this is not a fixed download-byte limit. Only queue admission has a 1 MiB JSON bound; other worker operations retain 8 KiB. Batches are processed sequentially and verified squares remain published when a later batch fails. Snapshot includes queue/batch status, verified counts and recovery capabilities.

An expired estimate can still finish offline when all remaining source ranges have checksum records and the inventory revision matches. Checksums are verified before conversion and a failure does not silently contact another provider. A retired source (404/410/412), missing ranges after estimate expiry, an inventory change or corrupt cache instead calls for `POST .../recalculate {id}`. It returns authoritative remaining coordinates and invalidates source discovery; calculate these coordinates, review fresh totals and confirm a new queue. Already installed squares are excluded.

The worker automatically prunes eligible expired metadata at startup and once per day while idle. It uses the same protected `scope: "expired-metadata"` cleanup available through the internal API: only unreferenced estimates older than 24 hours and recognized provider indexes older than seven days are eligible. Browser sessions do not control the maintenance lifecycle. Routine results and failures are recorded in worker logs; an unsuccessful maintenance pass does not prevent the server from serving installed maps. Active work, cancellation wind-down and source estimation defer cleanup.

Snapshot `temporaryStorage` continues to identify reclaimable saved preparation and expired metadata for API clients. The common UI hides routine temporary-file maintenance and offers **Discard download** beside a failed or cancelled task instead. `POST .../cleanup` with `scope: "saved-preparation"` requires the opaque `discardId` from the reviewed inventory. It is bound to task/file identities, so changed saved data returns 409 rather than accepting stale confirmation. The operation discards recognized ranges, checksums, stages and stopped-task quote plans, then removes the stopped job and queue. The response has `job: null` and `queue: null`; a task can also be discarded when its saved preparation is zero bytes. Select its squares again to request a fresh download. Saved ranges and referenced estimates are never removed automatically because of age or a worker restart: they can still allow verified preparation offline. No installed archive, unknown file or symlink is removed by either cleanup scope. Both scopes operate entirely offline.

The regional tests include 65-square admission, atomic validation, exclusions, restart/cancel recovery, expired fully cached preparation, corrupt cache refusal, retired-source recovery, stale cleanup confirmations, protected resume estimates, automatic-maintenance scheduling and failure isolation, and real HTTP endpoint/body-limit contracts.
