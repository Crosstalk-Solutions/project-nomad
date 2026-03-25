# Collections Seam Decision

## Decision

The emergency fork should **reuse the collections seam**, but **not import the whole upstream collections stack as-is**.

The right split is:

- **reuse in place**: manifest JSON files and their resource contract
- **reuse via adapter**: schema validation, tier resolution, and installed-status logic
- **do not reuse directly in v1**: controller, route, and update-service wiring that is tied to Adonis, Lucid, and the current server/admin runtime

In short:

> the collections seam is strong enough to preserve, but the current upstream implementation is too framework-coupled to become the emergency runtime boundary unchanged.

## Evidence from upstream

### What is strong and worth preserving

The upstream collections layer is already explicit, versioned, and content-oriented.

Relevant upstream files:

- `collections/kiwix-categories.json`
- `collections/maps.json`
- `collections/wikipedia.json`
- `admin/types/collections.ts`
- `admin/app/validators/curated_collections.ts`

Why this is a strong seam:

- manifests are versioned with `spec_version`
- resource entries are explicit: `id`, `version`, `title`, `description`, `url`, `size_mb`
- maps, curated ZIM content, and Wikipedia are all represented through the same family of contracts
- validators already define the acceptable schema cleanly

### What is reusable, but only behind a thin adapter

Relevant upstream files:

- `admin/app/services/collection_manifest_service.ts`
- `admin/app/models/collection_manifest.ts`
- `admin/database/migrations/1770849108030_create_create_collection_manifests_table.ts`
- `admin/app/models/installed_resource.ts`
- `admin/database/migrations/1770849119787_create_create_installed_resources_table.ts`

Useful parts:

- fetch and cache semantics for versioned specs
- pure tier resolution logic
- installed-status computation
- installed resource registry shape

Why it should sit behind an adapter:

- `CollectionManifestService` is coupled to Axios, Vine, Lucid, and hard-coded upstream URLs
- persistence is expressed through the current admin app models
- emergency runtime will likely want its own daemon-owned storage and sync state

### What should not be reused directly in v1

Relevant upstream files:

- `admin/app/controllers/easy_setup_controller.ts`
- `admin/app/controllers/collection_updates_controller.ts`
- `admin/start/routes.ts`
- `admin/app/services/collection_update_service.ts`

Why not:

- route/controller layer is tied to the admin UX and Adonis route tree
- update flow assumes current upstream API orchestration choices
- emergency runtime needs `ON` / `OFF` policy enforcement and armed one-shot semantics that do not exist here

## Practical reuse strategy

### Reuse in place

Keep these upstream assets as the canonical source-selection layer for now:

- `collections/*.json`

This preserves incremental compatibility and gives the emergency fork a stable seam with minimal divergence.

### Reuse through an emergency adapter

Create a future emergency-side adapter that owns this contract:

- load a manifest spec from local file or cached remote source
- validate against the upstream schema
- resolve tier inheritance
- compute installed status from local install state
- expose normalized results to the emergency daemon

This adapter should be framework-light and daemon-friendly.

### Keep emergency storage independent but mappable

The emergency runtime should not depend directly on Lucid models, but it should remain easy to map from upstream concepts:

- `collection_manifests` -> cached upstream specs
- `installed_resources` -> local package/install state

This gives you compatibility without inheriting the current runtime stack.

## Recommendation for v1

For the first technical implementation:

1. Treat `collections/*.json` as canonical upstream inputs.
2. Mirror the schema contract from `admin/types/collections.ts`.
3. Port or reimplement only the pure logic from `CollectionManifestService`:
   - tier resolution
   - installed-status computation
   - filename parsing
4. Do not reuse `CollectionUpdateService` directly.
5. Put all remote fetch and one-shot policy logic behind the emergency daemon.

## Concrete next extraction target

The best next code seam is:

> a pure emergency collections adapter with no Adonis dependency

That adapter should accept:

- manifest type
- raw manifest JSON
- local installed resource state

And return:

- validated normalized manifest
- resolved tiers/collections
- install status
- candidate resources for one-shot sync

## Bottom line

The emergency fork should **stay aligned to upstream collections data** while **owning its own runtime behavior**.

That is the cleanest way to keep incremental compatibility without dragging the entire admin/server stack into the emergency core.
