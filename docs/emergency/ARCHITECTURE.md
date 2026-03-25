# Emergency Runtime Architecture

## Summary

The emergency runtime is a downstream profile of Project N.O.M.A.D. for a dedicated handheld device.

The architectural center is not "online mode versus offline mode".
The center is a hard-offline local runtime that can ingest updates while the network exists.

## Product truth

- The primary asset is the local corpus.
- The primary read path is local search and local maps.
- The primary update path is opportunistic sync.
- Network loss is a normal operating assumption.
- In hostile or uncertain conditions, the device may need to remain on `OFF` and use only explicit one-shot exceptions.

## Downstream strategy

This fork should stay incrementally compatible with Project N.O.M.A.D. where practical.

Reuse first:

- collections and manifest shapes
- provider adapters and source metadata
- content ingestion and packaging logic
- offline maps plumbing where useful

Break away only where required by the emergency device use case:

- admin panel as primary UX
- Docker-orchestrated runtime assumptions
- mandatory Ollama/Qdrant path
- server-first deployment shape

## Runtime shape

The recommended runtime shape is:

1. installable mobile PWA
2. local daemon on the device
3. loopback HTTP API between UI and daemon
4. local SQLite plus FTS for text search
5. local filesystem storage for content and maps

The read path should remain local even when the device has connectivity.

## Network policy model

### `ON`

Use when continuous background sync is acceptable.

Behavior:

- daemon may probe connectivity
- daemon may refresh manifests on schedule
- daemon may download and index changed packages
- UI still resolves from local data first

### `OFF`

Use for battery conservation, OPSEC, or deterministic offline operation.

Behavior:

- daemon does not perform normal network requests
- probing is suppressed
- cached reachability state may become stale
- local corpus remains fully usable

### Armed one-shot sync

Use when the device should stay logically `OFF` but the operator wants to exploit a short or uncertain network window.

Behavior:

1. choose a bounded scope: `all`, `manifests`, `documents`, `maps`, or a single source
2. keep base policy at `OFF`
3. if a usable network is available, run one short sync job
4. if a usable network is not available yet, remain armed until timeout
5. auto-disarm after one attempt, success, failure, or timeout

Recommended defaults for v1:

- one-shot timeout: 10 minutes
- byte cap config exists but is disabled by default
- download count cap config exists but is disabled by default

## Operational rule

Treat network policy and observed reachability as separate concerns:

- policy answers "may the device use the network?"
- reachability answers "is a usable network currently present?"

This matters because in insecure scenarios a device may observe a usable network and still need to remain on `OFF`.

## Initial repo strategy

Keep emergency-specific work additive and easy to diff against upstream.

Recommended approach:

- keep upstream structure intact where possible
- add emergency docs under `docs/emergency/`
- add emergency runtime code in new bounded paths instead of patching unrelated upstream areas early
- prefer adapters and feature flags over broad rewrites

## Immediate milestones

1. Document the emergency profile and local API.
2. Identify the smallest reusable seams from upstream.
3. Build a loopback-only daemon skeleton for status, search, and one-shot sync.
4. Keep the first implementation local-search-first and map-capable.
