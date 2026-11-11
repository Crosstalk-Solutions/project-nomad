# Offline countries, published regions and routes

The maps module separates visual map archives from locally prepared route graphs. Navigation uses decimal coordinates, clicked map positions, saved Pins and an optional Base stored in the browser.

This document describes the engineering contract. The offline user guide is [`admin/docs/maps.md`](../admin/docs/maps.md), served at `/docs/maps`. Route metadata and Vine schemas generate `/reference#tag/maps` and `/api/openapi.json`; [`admin/docs/api-reference.md`](../admin/docs/api-reference.md) explains behavior beyond schemas. Ordinary local HTTP clients can use the APIs without an AI or MCP integration.

## Download units and territory policy

New route preparation is available only for a provider-published country/territory or genuine single-country subregion. `territoryScope` classifies a source unit as `country`, `subregion`, `collection` or `multi_country`, with explicit `countryCodes`. The bundled reviewed registry and provider ISO metadata establish this classification; a bounding box or first-level tree position is insufficient. Unknown source units remain navigation-only until trusted metadata classifies them.

World, continents and cross-country sources organize navigation but cannot start new installations, updates or retry preparations. A continent's presence in the upstream provider catalog is not permission to enqueue it. `assertInstallableTerritory` enforces the policy in the application; UI hiding alone is not sufficient. Routing inventory also excludes continental, multi-country and unclassified graphs. Existing source bytes or historical job records do not make a new continent task permissible.

Only actual provider-published subdivisions are offered. The current Geofabrik Brazil hierarchy ends at Centro-Oeste, Nordeste, Norte, Sudeste and Sul. NOMAD does not invent a São Paulo state OSM extract. IBGE CNEFE entries were address datasets, not road graphs; they are removed from the routing catalog and cannot be offered as route packages.

A region owns its published graph and version. `availability` (`direct`, `inherited`, `available`, `unavailable`) is distinct from task `status`. Compatible single-country ownership can supply a published child without copying another graph. The owner/version/date remain visible. Removing an owner changes descendant availability; an arbitrary geographic overlap does not establish interchangeable data. Partial imported urban graphs retain their original footprint rather than becoming whole states or countries.

## User flow and coordinate points

**Offline territories** is the settings entry point, with **Find a country or published region** and **All**, **Installed**, **In progress** and **Needs attention** filters. Opening a name reveals one inline management panel. Expanding geography is a separate action. **Advanced regions** shows provider-published subregions. A country grouping can organize published subregions when the provider offers no full-country source. Compatible [prepared packs](offline-map-packs.md) are also available to routing. Activity appears on the deepest visible owning branch, with filtered-out active work discoverable. Status polling preserves selection, expansion and focus.

**Install routes** is one action: obtain or reuse the OSM source, verify it, prepare the road graph and validate/publish the result. A cached-only source uses **Install routes** and **No download required**, with the source size labeled **Local source**. No component checkbox or second manual preparation/index-improvement step is needed. Already installed graphs remain usable during explicit replacement. Active Downloads retains original visual-map file transfers; the territory panel owns route-source transfer and preparation controls.

The top map field and each route card validate `latitude, longitude` synchronously without network requests. Typed names and postal codes are not resolved. A selected Pin/Base can retain its name as display context; clicking it uses stored coordinates, not a text query. Base lives in browser storage independently of shared Pins, graphs and visual archives.

Route cards have stable IDs and labels A–G: two to seven total points, with A as origin and the last point as destination. Five intermediate stops yield six legs. Left clicks on the map, marker layer or Pins list fill the highlighted card. Editing/deleting a pin does not assign a route point. Escape leaves map selection. Editing, removing or reordering a point invalidates the previous calculated route.

Card movement remains local: mouse/touch grips, floating whole-card previews, reserved space, animated neighbor movement, panel-edge scrolling, arrow controls and Reverse. Canonical order changes only on a valid drop; Escape/outside release cancels the preview. Focus and active-card IDs survive reordering, and reduced-motion preferences suppress nonessential motion.

Directions are paginated by leg. A complete browser-generated text file can be opened or downloaded with every leg and maneuver, in English while retaining proper street/place names. Estimated time excludes stop dwell time and live traffic. Right-click copies coordinates; right-drag stays a map gesture, with a manual-copy fallback if clipboard access is denied. Marker notes/colors/icons and Metric/Imperial/Nautical scale controls remain independent local map features.

## One graph for a journey

Routing preference is stored at `MAP_REGIONS_PATH/routing-settings.json`. Automatic mode chooses an eligible installed single-country/subregion graph covering every ordered point and supporting the profile. A fixed saved graph or explicit API/URL graph/version constrains selection. Preference changes save automatically; writes are serialized so a slower prior choice cannot overwrite the last choice. Missing fixed/pinned data returns an explicit error rather than a silent substitute.

Each request uses one connected graph. Separate countries/subregions are not stitched together, and installing all children does not create a parent graph. Plan Brazil and Argentina sections as separate trips inside their available graphs. No automatic border connector, continental preparation or online router fallback is introduced. Coverage polygons, including holes/multipolygons, reject obvious out-of-coverage points but cannot establish road connectivity.

Travel-mode limits are separate from geographic coverage. The pinned engine currently limits a pedestrian request to 250,000 meters. Valhalla error 154 becomes `DISTANCE_LIMIT_EXCEEDED`, retaining the numeric limit when supplied and suggesting separate shorter journeys. It does not suggest another download or switch to Car. Stops in one request do not evade a whole-request limit. Engine errors 170/171/442 preserve connectivity/access distinctions; busy/unavailable service and timeout are separate failures.

The broker serializes graph loading with route calculation so simultaneous requests cannot use another request's graph. Car and pedestrian instructions use `en-US`; geometry is GeoJSON `[longitude, latitude]`, request points are WGS84 `{lat, lon}`, distances are meters and durations seconds.

## Public sources and download safety

The version 2 source catalog records stable IDs, source-defined hierarchy, coverage and provenance. Territory policy determines which sources can start a new routing job. **Refresh public catalog** updates the local copy on request. Normal offline browsing reads the cached catalog or bundled fallback. Use [`update_region_catalog.py`](../install/maps/update_region_catalog.py) to generate the bundled routing catalog from the provider index, or pass `--index-file` to regenerate it from a saved snapshot.

Geofabrik's public [download index](https://download.geofabrik.de/index-v1.json) supplies OSM PBF inputs and region metadata. Attribution is retained under [OpenStreetMap's published terms](https://www.openstreetmap.org/copyright). Canonical URLs are administrator-managed catalog data, not arbitrary browser install input.

Every redirect passes `assertMapRegionRequestUrl`. Geofabrik transfers support the exact GWDG host `ftp5.gwdg.de`, path prefix `/pub/misc/openstreetmap/download.geofabrik.de/` and valid ASCII PBF/checksum paths. Wildcards, traversal, credentials, custom ports and arbitrary URLs remain rejected. Size previews, transfers and explicit source checks use the same bounded provider policy.

Sources need reliable size metadata and available disk space before transfer. Compatible partial files resume only when identity and range responses match; a full response replaces rather than appends to an old partial. Source bytes are stored by SHA-256 identity. An immutable compatible completed source can be reused without a provider request, including during explicit retry. Checksums identify bytes, not geographic accuracy or completeness.

Source transfer, local source bytes, installed graph size and preparation space are distinct. Zero remaining transfer plus a local source size means local processing only, not a repeated download or an already installed graph. There is no fixed source-file-size ceiling. The conservative admission requirement remains `12 × source bytes + 8 GiB`; it is neither a storage reservation nor an exact final-size prediction.

A Windows/WSL deployment can probe the physical backing volume through `MAP_REGIONS_BACKING_DISK_PATH`; the smaller local/backing free-space value is used. A configured unreadable probe blocks new work rather than claiming capacity. Available memory, processing time and temporary output remain independent constraints for large country graphs.

## Routing-only preparation worker

`install-map-region` jobs run through BullMQ and an internal serial preparation service. New requests have `components: ["routing"]`. The sidecar consumes verified local file references, never a browser download URL, and has no Docker socket or public port.

`POST /build` accepts `component: "routing"` with an `osm-pbf` source. Requests for unsupported components fail before source/output lookup or queue submission. `/status` reports routing readiness, the engine version, job namespace and telemetry version.

The worker verifies the source hash, builds administrative information, creates Valhalla tiles with two build threads, and packages `routing.tar`. It verifies the prepared artifact's path, size and SHA-256 before the application publishes its immutable installed version. Failure or cancellation preserves the previous installed graph. The builder image contains the worker and the standalone `build_package.py` command, which runs the same routing pipeline.

The pinned Valhalla image supplies the native routing tools and Python. Timezone data is baked during image construction and used locally during graph preparation. Provisioning images/timezone inputs can need Internet access; preparing a verified downloaded source then requires no runtime timezone download.

### Operation identity, cancellation and progress

New routing requests retain a durable operation generation and captured source/preparer identity. Cancellation is a durable request, acknowledged only after queued/native work stops. Process groups isolate Valhalla child commands so cancellation stops the whole task. Retry requires confirmed stopped state and preserves the original source/intent; it does not become a source-update request.

Job namespaces (`MAP_REGION_JOBS_SUBDIR`) isolate preparation services. On startup each worker marks its own interrupted jobs. Temporary/native command timeouts remain bounded.

| Phase | Meaning |
| --- | --- |
| `queued` | Waiting for a local worker |
| `verifying_source` | Read and verify captured input bytes |
| `building_routing` | Build administrative data, road tiles and graph extract |
| `validating` | Verify prepared graph bytes and checksum |
| `publishing` | Publish verified immutable installed metadata |
| `ready` | The route package is ready offline |

The `detail` token identifies work such as `routing_admins`, `routing_tiles`, `routing_extract`, `source_checksum` or `artifact_checksum`. Telemetry accepts known phases/tokens and finite nonnegative counters only; it contains no private labels or arbitrary source records. `heartbeatAt` measures responsiveness, while `lastProgressAt` changes only when actual work/phase advances. Counter/rate fields reset between phase/detail changes. Hashing reports real bytes; graph-build file growth is activity evidence, not a trustworthy percentage.

`GET /api/maps/operations` is lightweight and must not hash full sources or scan databases to provide status. Optional percentages need known totals. `phaseEtaMinSeconds`/`phaseEtaMaxSeconds` estimate the current phase/detail only, using recent measured work or at least three comparable local samples. Local phase history is bounded to 256 small metadata samples grouped by format, component, phase/detail and source scale. Waiting, stale, failed/cancelled work does not receive a claimed ETA. Unknown totals stay indeterminate.

## Storage and deployment

```text
map-regions/
  catalog.json
  routing-settings.json
  state/<region-id>/routing.json
  sources/<region-id>/<input-sha256>.osm.pbf
  sources/<region-id>/current.json
  staging/<job-id>/routing.tar
  staging/<job-id>/build.log
  installed/<region-id>/routing/<source-prefix>-<artifact-prefix>/
    routing.tar
    manifest.json
  builder-jobs/<job-id>.json
```

The application and builder share region storage read/write; the router mounts installed graphs read-only. Source/output paths are resolved inside the allowed `sources`/`staging` directories. Visual PMTiles archives are reused through `MAP_VISUAL_PATH`; their header footprint/zoom estimate is independent of route graph availability. Pins are stored separately from route packages, and Base/view/scale preferences are browser-local.

### Enable routes on an existing installation

Offline routing is an optional Compose deployment. Use an admin image that includes this module and add [`compose.regions.example.yaml`](../install/maps/compose.regions.example.yaml) to your existing Compose project. From the repository root, set `NOMAD_MAPS_MODULE_DIR` to the absolute `install/maps` path. If NOMAD storage was relocated, set `NOMAD_STORAGE_PATH` to the host path mounted at `/app/storage` in your base Compose file. Both sidecars must see the same map data as the admin. If the data volume is backed by a separate physical disk, [`compose.backing-disk.example.yaml`](../install/maps/compose.backing-disk.example.yaml) can add a read-only space probe.

```sh
export NOMAD_MAPS_MODULE_DIR="$PWD/install/maps"
export NOMAD_STORAGE_PATH=/opt/project-nomad/storage
docker compose -p project-nomad \
  -f /opt/project-nomad/compose.yml \
  -f "$NOMAD_MAPS_MODULE_DIR/compose.regions.example.yaml" \
  --profile map-preparation up -d --build
```

Adjust the project name, Compose file and storage path to match your installation. If the compatible admin image is defined in a separate overlay, include that file in the command. The `map-preparation` profile enables new preparation. Installed routes use the broker and can run with that profile disabled.

The standard installer and built-in updater use `/opt/project-nomad/compose.yml`. If the updater recreates the admin using only that file, it can remove the routing environment and internal network attachment from the admin container. Keep the overlay and its configuration together, and use the same full Compose configuration when recreating a compatible admin. Graphs are stored under the host data directory, so they remain available after the overlay is reapplied. Finish or cancel active route preparation before replacing its worker.

The examples build `nomad-maps-builder:local` from `install/maps/Dockerfile.builder`. `MAP_ROUTER_URL` selects the internal broker and `MAP_REGION_BUILDER_URL` selects the preparer. Align `MAP_REGIONS_PATH` with its mounts. `MAP_REGIONS_CATALOG_PATH`, `MAP_REGIONS_BACKING_DISK_PATH` and `MAP_VISUAL_PATH` configure the catalog, capacity probe and reusable visual archives.

Keep sidecars on the internal maps network with read-only container roots and writable data/tmp mounts. The example builder has an 8 GiB memory and three CPU limit. [`compose.progress.example.yaml`](../install/maps/compose.progress.example.yaml) optionally changes resources on that same worker, with defaults of 6 GiB and two CPUs. Very large graphs may need additional resources.

### Test from a clean clone

From the repository root in a Linux shell, including WSL, create local credentials and start the independent development stack. Save these values securely if you want to reuse the development volumes in a later shell. Docker needs internet access to build the initial images.

```sh
export MAPS_DEV_DB_PASSWORD="$(openssl rand -hex 24)"
export MAPS_DEV_ROOT_PASSWORD="$(openssl rand -hex 24)"
export MAPS_DEV_APP_KEY="$(openssl rand -hex 32)"
docker compose -f install/maps/compose.development.yaml up -d --build
```

Open `http://localhost:8081/settings/maps`. Use `MAPS_DEV_PORT` if 8081 is occupied. The stack builds NOMAD from the root Dockerfile and keeps its database, Redis and map data in separate named volumes. Its builder and router are on an internal network. Run `docker compose -f install/maps/compose.development.yaml down` when finished. The named volumes retain their data.

Use **Choose Countries** or **Curated Map Regions** to install visual map coverage, and **Install routes** under **Offline territories** to prepare a graph. The [small Monaco smoke test](offline-map-packs.md#prepare-a-small-graph-and-test-routes-offline) checks the builder and the router without starting this stack.

## API summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/maps/regions/catalog` | Effective country/subregion catalog, states, source provenance and readiness |
| POST | `/api/maps/regions/install` | Queue routing for one eligible published territory |
| GET | `/api/maps/regions/:regionId/estimate?components=routing` | Missing transfer, reusable source and capacity preview |
| POST | `/api/maps/regions/check-updates` | Explicit public-source freshness check |
| POST | `/api/maps/regions/update` | Explicit route source replacement |
| POST | `/api/maps/regions/cancel` | Request the active route task to stop |
| POST | `/api/maps/regions/retry` | Retry confirmed stopped routing work with original intent |
| GET | `/api/maps/operations` | Correlated local task progress |
| POST | `/api/maps/regions/refresh-catalog` | Refresh supported public metadata without installing it |
| DELETE | `/api/maps/regions/:regionId/routing` | Remove an idle route component |
| GET | `/api/maps/routing/coverage` | Eligible installed single-country/subregion graphs |
| GET/PUT | `/api/maps/routing/settings` | Automatic/fixed local routing preference |
| POST | `/api/maps/route` | Calculate an ordered 2–7-point route in one graph |

Map links use `origin`, `destination`, contiguous `via1` through `via5`, `profile=auto|pedestrian`, optional graph `region`/`version`, and explicit `autoroute=1`. Invalid/duplicate/gapped vias do not calculate a route. Existing two-point/two-via and `lat`/`lng`/`zoom` marker links remain supported. Links do not create permanent Pins or download data.

## Data quality and validation

Downloaded graphs describe a source snapshot, not live traffic, closures or guaranteed emergency access. Missing/disconnected/access-restricted roads can prevent a route even inside a coverage polygon. Coordinate navigation does not establish an entrance's accessibility or search Google-equivalent address data. Retain attribution and source redistribution terms when sharing prepared graphs.

Execution evidence belongs to a delivery/release report with its exact image and source snapshot. Before an upstream proposal, verify:

1. Provider registry/classification, hierarchy/cycles, allowlisted redirects, truthful source granularity, and rejection of new continent/multi-country/unknown units through API and UI.
2. Local coordinate entry and rejection of unsupported builder components before source or native I/O.
3. Source size/capacity, physical backing-volume probes, checksums, interrupted/range resume, cache reuse, explicit update/retry, cancellation and immutable publication.
4. Native routing phases, process-group cancellation/recovery, queue identity, real hash counters, indeterminate graph-build steps and local/measured ETA scope.
5. Two through seven ordered points, six legs, English maneuver/export completeness, old/new links, version pins, polygon holes and intermediate-point coverage.
6. Car/walking distance limits versus real disconnection/access, engine busy/unavailable/timeout and no silent mode switch, graph merge or online fallback.
7. Saved Pins/Base, notes/colors/icons, highlighted-card assignment, coordinate clipboard fallback, right-drag suppression, keyboard/drag reorder, reduced motion, scale controls and desktop/mobile layout.
8. Fully provisioned operation with external networking blocked: coordinate entry, cached-source preparation, visual maps, local routing, Pins/Base recall, docs/API reference and complete text export.
