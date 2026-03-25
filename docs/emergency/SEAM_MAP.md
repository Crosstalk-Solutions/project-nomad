# Emergency Seam Map

## Purpose

This note identifies the best upstream seams to reuse in the emergency downstream fork and the areas that should remain isolated in v1.

The goal is to keep the delta against Project N.O.M.A.D. small while moving toward a hard-offline, device-first runtime.

## Strong seams to reuse first

### 1. Collections and manifest contracts

This is the strongest reuse seam in the current upstream tree.

Relevant upstream files:

- `collections/kiwix-categories.json`
- `collections/maps.json`
- `collections/wikipedia.json`
- `admin/types/collections.ts`
- `admin/app/validators/curated_collections.ts`
- `admin/app/services/collection_manifest_service.ts`
- `admin/app/models/collection_manifest.ts`

Why it is strong:

- the resource contract is explicit and already versioned via `spec_version`
- upstream already validates the manifest schema
- status computation is already separated from UI concerns
- the same seam covers ZIM, maps, and curated Wikipedia content

Emergency fork guidance:

- preserve these schemas as long as possible
- treat them as the canonical source selection layer
- add emergency-specific metadata only through additive fields or adapters

### 2. Installed resource registry

Relevant upstream files:

- `admin/app/models/installed_resource.ts`
- `admin/app/services/collection_manifest_service.ts`
- `admin/app/services/collection_update_service.ts`

Why it is useful:

- upstream already tracks `resource_id`, `resource_type`, `version`, `url`, `file_path`, and install time
- this is close to the emergency fork's need for local package/install state

Emergency fork guidance:

- reuse the conceptual shape
- keep an adapter boundary because the emergency runtime will likely want extra sync state and stronger local-only semantics

### 3. Maps pipeline

Relevant upstream files:

- `collections/maps.json`
- `admin/app/services/map_service.ts`
- `admin/app/controllers/maps_controller.ts`
- `admin/start/routes.ts`

Why it is strong:

- map packs are already treated as a distinct asset class
- upstream already has PMTiles-specific download and asset handling
- there is already a collection-based install flow for map groups

Emergency fork guidance:

- reuse the collection metadata and PMTiles handling ideas
- keep map storage and install semantics compatible where practical
- isolate browser/admin-specific delivery details behind adapters

### 4. Download job abstraction

Relevant upstream files:

- `admin/app/jobs/run_download_job.ts`
- `admin/app/utils/downloads.ts`
- `admin/app/services/queue_service.ts`

Why it matters:

- upstream already models resumable background downloads with retry and deduplication by URL
- this is close to the emergency fork's bounded ingest path

Emergency fork guidance:

- keep the download lifecycle shape
- do not couple the emergency runtime directly to BullMQ, Docker, or embedding callbacks
- wrap this seam behind a simpler emergency sync job interface

## Medium-strength seams to adapt, not adopt whole

### 5. Route and capability separation

Relevant upstream file:

- `admin/start/routes.ts`

What is reusable:

- upstream capability boundaries are clear: maps, docs, downloads, settings, system, ollama, rag, zim

What to do in the emergency fork:

- reuse the capability partitioning idea
- do not mirror the entire route tree
- build a smaller loopback API around `status`, `mode`, `sync`, `search`, `documents`, `maps`, and `sources`

### 6. Collection update flow

Relevant upstream file:

- `admin/app/services/collection_update_service.ts`

What is reusable:

- update-check request shape
- version comparison flow
- dispatch to resource-specific download handling

Why it is only medium strength:

- it assumes a remote Nomad API and current server-side orchestration choices
- the emergency fork needs stricter `OFF` behavior and one-shot exception semantics

## Seams to isolate or avoid in v1

### 7. RAG and embedding runtime

Relevant upstream file:

- `admin/app/services/rag_service.ts`

Why to isolate:

- it pulls in Qdrant, Ollama, OCR, PDF pipelines, and embedding behavior
- this is not aligned with the emergency v1 requirement of deterministic local search via SQLite FTS

Rule:

- reuse ideas about ingestion boundaries, not the runtime dependency stack

### 8. Ollama and model-management services

Relevant upstream area:

- `admin/app/services/ollama_service.ts`
- `admin/app/controllers/ollama_controller.ts`

Why to isolate:

- this is optional future capability, not part of the emergency core

### 9. Docker and system-orchestration assumptions

Relevant upstream area:

- `admin/app/services/docker_service.ts`
- `install/`

Why to isolate:

- the emergency fork is device-first and should not depend on Docker as the core runtime model

## Recommended first extraction order

1. Collections and validators
2. Installed resource state and local package metadata
3. Maps metadata and PMTiles install flow
4. Bounded download abstraction
5. Loopback-only emergency API around those seams

## Rule of thumb

If a piece of upstream code helps define:

- what content exists
- how it is versioned
- how it is downloaded
- how it is stored locally

then it is probably a good seam.

If a piece of upstream code primarily exists to:

- manage containers
- power chat or embeddings
- expose server/admin UX assumptions

then it should stay out of the emergency v1 core.
