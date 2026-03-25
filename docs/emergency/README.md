# Emergency Runtime Profile

This folder defines a downstream emergency profile for Project N.O.M.A.D.

The profile is designed for a dedicated Android device running Ubuntu/Linux where the system must remain useful with zero network and treat network availability as an opportunistic ingest path, not as part of the main read path.

## Core principles

- Hard-offline first: search, maps, and critical reads must work from local storage.
- Incremental compatibility: reuse upstream Project N.O.M.A.D. code where practical and keep the delta small.
- Device-first runtime: prefer a local daemon plus a mobile-friendly PWA over server/admin assumptions.
- Bounded sync: network use should be explicit, short, and policy-driven.

## Network policy model

- `ON`: normal background sync is allowed.
- `OFF`: no normal network activity is allowed.
- Armed one-shot sync: a bounded exception that can remain armed while base policy stays `OFF`.

## Document map

- [Architecture](./ARCHITECTURE.md)
- [Local API](./LOCAL_API.md)
- [Seam Map](./SEAM_MAP.md)
- [Collections Seam](./COLLECTIONS_SEAM.md)
- [Bootstrap Prompt](./BOOTSTRAP_PROMPT.md)

## Intended use

This is not a chat-first product.
It is a continuity-of-information runtime that keeps a local corpus current while it can, then continues to serve that corpus when the network disappears or should not be used.
