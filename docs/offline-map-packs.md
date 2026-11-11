# Offline routing packs

Prepared packs let administrators distribute Valhalla graphs through a configured catalog. For public country and regional sources, use **Settings → Maps → Offline territories** to download the source and prepare the graph locally. See the [offline regions guide](offline-regions.md).

Both workflows provide offline car (`auto`) and walking (`pedestrian`) directions from coordinates. Route times are estimates from the installed road data and routing profile. Data completeness depends on the source and build of each pack.

## Install and use a prepared pack

1. Add the pack to the administrator-managed catalog and queue it through `POST /api/maps/packs/install`.
2. Check installation progress and validation through `GET /api/maps/packs`. A failed download can be queued again. Use the delete endpoint to discard a failed pack and its partial data.
3. Check `GET /api/maps/routing/coverage` for the installed graph. In **Settings → Maps → Routing**, use **Automatic** or choose the installed graph. API clients can select it explicitly with a `packs:<id>` region ID. Activation is available for legacy API clients.
4. Open **Maps** and enter coordinates, click the map, or select saved Pins. Choose **Car** or **Walking** and calculate the route.
5. To free storage, deactivate the pack through the API if it is active for legacy clients, then delete it. Deactivation keeps the graph installed.

Map display downloads remain in the existing sections of the Maps settings page. A visual `.pmtiles` file and a routing graph serve different purposes: installing one does not create the other. Install visual coverage for the region as well if the route should appear over a detailed offline map.

All points must be connected within one graph. The bounding box is an initial coverage check. Islands, disconnected roads, missing source data and paths that leave the graph can prevent a route even inside that box. An empty prepared-pack catalog leaves the separate public-source territory catalog available.

## Catalog and manifest

The catalog is an administrator-managed JSON file read by NOMAD. The API accepts a package ID from that catalog, rather than an arbitrary manifest or URL supplied by a browser request. The shared types are in [`admin/types/map_packs.ts`](../admin/types/map_packs.ts), and validation is in [`admin/app/utils/map_pack_manifest.ts`](../admin/app/utils/map_pack_manifest.ts).

An empty catalog is valid:

```json
{
  "schema_version": 1,
  "packages": []
}
```

Each entry in `packages` has these fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `schema_version` | Yes | `1` |
| `id` | Yes | Stable, unique ID containing lowercase letters, numbers, `_`, or `-`; starts with a letter or number; maximum 80 characters |
| `name` | Yes | Human-readable country or region name |
| `version` | Yes | Build identifier; starts with a letter or number and uses letters, numbers, `.`, `_`, or `-`; maximum 80 characters |
| `description` | No | Description of the pack |
| `coverage.bbox` | Yes | `[west, south, east, north]` in longitude/latitude degrees; west must be less than east and south less than north |
| `coverage.description` | No | Readable description of the geographical coverage |
| `coverage.territory_scope` | For routing | `country`, `subregion`, `multi_country`, or `collection`. Routing uses `country` or `subregion`. |
| `coverage.country_codes` | For routing | Uppercase ISO 3166-1 alpha-2 codes, supplied with `territory_scope`. Exactly one code for `country` or `subregion`, at least two distinct codes for `multi_country`, and an empty array for `collection`. |
| `routing.engine` | Yes | `"valhalla"` |
| `routing.profiles` | Yes | A nonempty array containing `"auto"`, `"pedestrian"`, or both, without duplicates |
| `routing.artifact.url` | Yes | The real download URL of the prepared graph file |
| `routing.artifact.filename` | Yes | `"routing.tar"` |
| `routing.artifact.size_bytes` | Yes | Exact positive integer file size in bytes |
| `routing.artifact.sha256` | Yes | SHA-256 digest of the file, as 64 hexadecimal characters |
| `source` | No | Source of the map data |
| `created_at` | No | Build date displayed in the manager |
| `attribution` | No | Attribution required by the source data |

The graph must be built for the Valhalla runtime deployed with NOMAD. A raw OSM `.pbf`, a `.pmtiles` file, or an arbitrary archive cannot be installed as a routing pack. `routing.tar` is the graph artifact used directly by the router; NOMAD does not extract its contents into the host filesystem.

Use real artifact sizes and digests from the finished build. The source PBF download size is not the routing pack size. Publish a new version when graph contents change, preserve the matching attribution, and keep each published version immutable. Check source licensing before distributing derived graphs.

Older manifests without territory metadata remain readable and manageable. To make an existing graph eligible for routing, verify its source, checksum and single-country footprint. Add the verified `coverage.territory_scope` and `coverage.country_codes` to the installed `manifest.json` and update the matching catalog entry for future installs. The existing `routing.tar` and version can be reused. NOMAD uses the installed manifest to determine eligibility.

## Configuration and storage

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAP_PACKS_PATH` | `/app/storage/map-packs` | Package storage inside the NOMAD container |
| `MAP_PACK_CATALOG_PATH` | `/app/resources/map-packs/catalog.json` | Administrator-managed catalog file |
| `MAP_ROUTER_URL` | Deployment-specific | Internal Valhalla service URL; the service reports readiness through `/status` |
| `MAP_PACK_ALLOW_LOCAL_DOWNLOADS` | Disabled | Explicit opt-in for local HTTP or private-network mirrors, useful for local development |

Published pack downloads require HTTPS and public network addresses by default. The local-mirror setting should be enabled only when that deployment deliberately needs a trusted local mirror. Credentials in download URLs and cloud metadata addresses are rejected.

Verified graphs are stored under:

```text
MAP_PACKS_PATH/
  installed/
    <package-id>/
      <version>/
        manifest.json
        routing.tar
```

The `active` link identifies the selected installed pack. The application's storage and router mounts must point to the same pack storage. On Windows with Docker and WSL, these paths are container paths; the corresponding host location depends on the deployment's volume mounts.

Downloads use staged files and support resuming when the mirror supports HTTP ranges. NOMAD verifies the exact byte count and SHA-256 before installing a graph. Downloading and verifying are separate states in the API. The background job runs on the `map-pack-downloads` queue using the `install-map-pack` job key.

The first version keeps the installed manifest visible even if the catalog publishes a newer version. In-place updates are deferred: the installation API refuses a different version of an installed pack before modifying its state or files. Deactivate the pack if necessary, remove it, then install the catalog's current version to replace it. Reinstalling the same installed version is idempotent.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/maps/packs` | Return `packages`, `activePackageId`, `routerReady`, and an optional `routerError` |
| `POST` | `/api/maps/packs/install` | Queue installation; body: `{ "packageId": "..." }` |
| `POST` | `/api/maps/packs/activate` | Activate an installed pack; body: `{ "packageId": "..." }` |
| `POST` | `/api/maps/packs/deactivate` | Deactivate the current pack, keeping its downloaded graph installed |
| `DELETE` | `/api/maps/packs/:packageId` | Remove the selected installed pack |
| `GET` | `/api/maps/routing/coverage` | List installed graphs eligible for routing, including prepared packs with single-country metadata |
| `POST` | `/api/maps/route` | Calculate a route with `automatic: true`, optional `regionId: "packs:<id>"`, optional `packageVersion` with a region ID, `profile` and two to seven `{lat, lon}` locations |

Each returned package includes its manifest plus `status`, optional `progress` (0–100), optional `error`, and optional `installedVersion`. Status is one of `available`, `downloading`, `verifying`, `installed`, `active`, or `failed`. Legacy routing requests can pass `packageId` and `packageVersion` to use the active pack.

Route responses include a GeoJSON `LineString`, distance in meters, duration in seconds, maneuver instructions, and the dataset ID/version. Requests for a stale active dataset return 409; points outside coverage return 422. No online routing fallback is used.

## Local validation environment

See [the development Compose instructions](offline-regions.md#test-from-a-clean-clone) to build the full UI and routing services from source.

### Prepare a small graph and test routes offline

Run these commands from the repository root in a Linux shell (including WSL). The image build and source download are the online setup. The example uses the January 2026 [Geofabrik Monaco extract](https://download.geofabrik.de/europe/monaco.html), © OpenStreetMap contributors.

```sh
docker build -t nomad-maps-builder:local -f install/maps/Dockerfile.builder install/maps
workspace=$(mktemp -d)
mkdir -p "$workspace/sources"
curl -fL https://download.geofabrik.de/europe/monaco-260101.osm.pbf \
  -o "$workspace/sources/monaco-260101.osm.pbf"
```

Prepare the graph with the pinned Valhalla image and the same source checksum, administrative data, timezone and extraction steps used by the region worker. The helper prints the finished artifact's path, size and SHA-256. Give each new build a fresh directory under `staging/`.

```sh
docker run --rm --network none --read-only --tmpfs /tmp \
  --mount "type=bind,source=$workspace,target=/regions" \
  --entrypoint python3 nomad-maps-builder:local /builder/build_package.py \
  sources/monaco-260101.osm.pbf staging/monaco-260101/routing.tar \
  2c0debd7676c0d0d80ec534251cb004a6797441d14512cb83d01fe1ad81363bf
```

Place the graph in the layout read by the broker. This staging copy is for the smoke test. For a published pack, use the catalog and install API so NOMAD can track and verify it.

```sh
mkdir -p "$workspace/installed/monaco-smoke/2026-01-01"
cp "$workspace/staging/monaco-260101/routing.tar" \
  "$workspace/installed/monaco-smoke/2026-01-01/routing.tar"
docker run --rm --network none --read-only --tmpfs /tmp \
  --mount "type=bind,source=$workspace,target=/packs,readonly" \
  --mount "type=bind,source=$PWD/install/maps,target=/scripts,readonly" \
  --entrypoint python3 nomad-maps-builder:local /scripts/offline_smoke.py \
  monaco-smoke 2026-01-01 --point 43.73775 7.42164 --point 43.74176 7.42521
```

The test prints `OFFLINE_SMOKE_RESULT` with distance, estimated time and number of legs for car and walking. To test another graph, pass its ID, version and two to seven coordinates that are accessible by both modes. To use a graph from **Offline territories**, mount the region volume at `/regions` and pass `--namespace regions`. The broker unit tests are in [`install/maps/test_router_broker.py`](../install/maps/test_router_broker.py).
