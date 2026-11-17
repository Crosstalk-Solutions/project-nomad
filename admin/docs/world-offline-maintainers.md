# World offline operator and maintainer notes

## Enable the feature from source

The standard deployment keeps World offline disabled until an operator adds the downloader. When testing a source build, use the optional `install/world_offline_compose.yaml` overlay after the existing management Compose file. Set `NOMAD_WORLD_ADMIN_IMAGE` to the tag of the local admin build, `NOMAD_STORAGE_PATH` to the same host directory mounted at `/app/storage`, and `WORLD_OFFLINE_TOKEN` to a private random value shared between admin and the download worker. Store the value with the Compose environment and keep it out of reports.

Create the `maps/pmtiles` and `maps/.world-offline` subdirectories before starting the worker. Ensure the worker UID/GID 65532 can use both directories and the admin can read the resulting maps. Keep them on the same mounted filesystem. Review the local deployment settings before starting the two services. The worker has no published port. Only the worker needs to reach the public providers during acquisition. The panel serves installed maps from disk.

## Source data and attribution

Each installation downloads from the selected public provider and generates or prepares its PMTiles archives locally. Ship the catalog, tooling, documentation, and small test fixtures with the code. Data revisions are separate from the application release.

| Package | Source and provenance to retain |
| --- | --- |
| **Blue Marble 2004** | NASA Earth Observatory / Reto Stöckli, Blue Marble Next Generation. Record the year, month, nominal resolution, source files, and any provider identifiers. Credit the source alongside published NASA media. [NASA source](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/) · [NASA media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) |
| **Worldwide satellite** | VersaTiles satellite. Retain available archive version and per-source attributions. Global source credits include Copernicus Sentinel-2 Global Mosaic and NASA Blue Marble. The provider lists additional source terms by dataset and coverage. [Satellite tileset](https://docs.versatiles.org/basics/tilesets.html#satellite) · [Sources and licenses](https://versatiles.org/sources/) |
| **Earth Relief** | VersaTiles Hillshade Vectors, CC BY 4.0. Carry forward the Mapzen Jörð terrain source attributions and the exact provider archive revision that supplied each band. [Hillshade tileset](https://docs.versatiles.org/basics/tilesets.html#hillshade) · [Terrain source attributions](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |

Treat the application's code license and each provider's data terms independently. A source URL by itself identifies a location. Keep source identity, available source revision or ETag, and the expected length with the operation and the installed inventory where available. Mark a local reduction as derived from its parent package and preserve that parent provenance. Retain source credits in the inventory and show them in the map UI.

Use provider-published digests where available and verify them against the named asset. Calculate and retain an output SHA-256 so the installed PMTiles can be checked independently after a copy or migration. A locally calculated digest verifies those local bytes. Keep provider identity and source validation as separate provenance records. [PMTiles concepts](https://docs.protomaps.com/pmtiles/)

## Operation and recovery

The runtime separates map reading, downloading, and activation.

- The maps UI lists packages and reads installed imagery or relief through local tile routes.
- The download service handles source requests, resume checkpoints, preparation, and verification. Earth Relief can use separate zoom bands, and Blue Marble stages months separately.
- The install operation verifies generated artifacts before committing the catalog of active archives. The previous installation remains active while a replacement is built. After the commit, reclaim only files owned by that managed package.

Provision the runtime and external tools through the target environment's supported installation process. Use per-platform pinned versions or digests for tools that generate or verify archives. Verify an optional downloader can be stopped while the installed map still opens after reload.

For backups, wait for map operations to finish or pause writers at a safe point. Take a consistent snapshot containing the active map archives and their inventory metadata. Retain the provenance and output digests. Restore the complete matching snapshot into the installation's maps volume with its normal permissions. Check the inventory, hash and structure of the archives, and each affected layer from a browser connected locally. Exercise this with a disposable volume first. You can also restore by downloading the catalog entry again while its source remains accessible.

For a diagnostic copy, capture the application build, catalog revision, affected operation and stage, architecture, and relevant errors. Omit credentials, user-specific paths and indexes, original map arrays, and downloaded archives from public reports.

## Validation matrix

Use a fresh checkout of the target base and small generated or reusable licensed fixtures. Capture build and fixture revisions alongside results.

| Layer of testing | Run in PR CI | Validate |
| --- | --- | --- |
| App build and API contract | Existing Node workflow and functional OpenAPI suite | Native build and route completeness. Request validation, amounts in bytes, available and degraded inventory, operation transitions, errors, and access policy. |
| Worker and storage | Version-controlled tests with fixture HTTP sources and temporary volumes | Range and source identity checks, interrupted transfer and checkpoint restart, low disk, digest mismatch, no change to installed packages on failure, atomic commit, remove, discard, and local reduction. |
| Browser flows | Small PMTiles fixture set and isolated application | Common table order and keyboard controls, install/upgrade feedback, only one active tier per family, Blue Marble month changes, attributions, viewport at 320 px, and preservation of the existing vector map. |
| Offline runtime | Same fixture packs after queue stop and app restart | Local tiles load with provider traffic blocked. A failed or unavailable worker leaves the prior installation readable. |
| Release runtime | Runtime image on each supported platform | Fresh storage, installation without a host-side development environment, correct native tool architecture, permissions and actual placement of persisted data. |
| Real providers | Optional manual or scheduled run | Current source headers/versions, a small allowed sample and a real end-to-end upgrade. Record peak disk, working set, and optional full-world install on an isolated volume. |

Configure the target branch's test environment and database, then run the app checks from the repository root.

```sh
cd admin
npm ci
npm run typecheck
npm run test:unit
node ace test functional --files=tests/functional/openapi.spec.ts
npm run build
```

Use the Node version selected by the target branch's CI. The provider tests should have a pinned local test origin and synthetic range fixtures. Keep real NASA and VersaTiles downloads outside required PR CI so a change in an external file or its availability does not make fixture-based tests unreliable.

With the candidate app running, use the following read-only smoke check against its local origin. Set `NOMAD_WORLD_TEST_URL` to the origin of the app you want to test.

```sh
NOMAD_WORLD_TEST_URL=http://localhost:8080 node --input-type=module <<'JS'
import assert from 'node:assert/strict'

const origin = process.env.NOMAD_WORLD_TEST_URL
const endpoint = '/api/maps/world-offline'
async function get(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(10000) })
  assert.equal(response.status, 200, path)
  return response.json()
}

const spec = await get('/api/openapi.json')
assert.ok(spec.paths[endpoint]?.get, 'Inventory must be in OpenAPI')
for (const action of ['download', 'remove', 'pause', 'resume', 'cancel', 'retry', 'discard']) {
  assert.ok(spec.paths[endpoint + '/' + action]?.post, action + ' must be in OpenAPI')
}
const inventory = await get(endpoint)
assert.ok(Array.isArray(inventory.packs), 'Expected an inventory with a packs array')
JS
```

## Prepare the review package

Use a clean branch derived from the chosen upstream target. Inspect the proposed files from the repository root, using the actual target ref in place of `origin/dev` when appropriate.

```sh
nomad_world_review_base=$(git merge-base HEAD origin/dev)
git status --short
git diff --check "$nomad_world_review_base"
git diff --stat "$nomad_world_review_base"
git diff --name-only "$nomad_world_review_base"
```

Review the candidate for application code, catalog metadata, source credits, docs, and small licensed or generated fixtures. Keep downloaded tiles, workspace checkpoints, database copies, private paths and credentials in local evidence storage. Share the test summary and cropped screenshots with the PR only after checking them for installation-specific data. Use the related upstream issue to explain which part of worldwide maps this patch addresses.

## What the laboratory validated

The isolated NOMAD2 run verified native rendering of the three installed packages after restart with the download worker stopped and provider traffic blocked. It also exercised month changes, native map controls, drawer sizes, and mocked satellite management at desktop and narrow widths. These results describe that build and its installed data. Report production build, clean installation, restart/resume behavior, and every supported platform separately after the checks above.

See the [user manual](/docs/world-offline) and [API notes](/docs/world-offline-api).
