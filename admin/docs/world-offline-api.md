# World offline API

The [interactive API reference](/reference) and the [OpenAPI document](/api/openapi.json) describe the contract served by your NOMAD. Use the documented maps access policy on the same NOMAD that holds the archives.

## Read inventory

`GET /api/maps/world-offline` reports the catalog, installed levels, available disk space when known, and current operation if present. The response identifies the active tier and lower levels already included in it. A higher level can require a full download or just missing data depending on the provider and package format.

The offline inventory can keep reporting verified local archives while the download service is unavailable. In that state, the response can omit worker-only details such as an active transfer or a free-space estimate. Treat missing estimates as unknown and use the availability field before calling mutations.

## Read contour lines from installed elevation data

The contour endpoint uses the locally installed archive and remains available while the download worker is stopped. Coordinates use decimal degrees and elevations use meters. The contour interval is fixed at 100 m.

| GET path | Query | Result |
| --- | --- | --- |
| `/api/maps/elevation/contours` | `west`, `south`, `east`, `north`, `zoom` | GeoJSON lines at 100 m intervals for a bounded viewport, plus the native data zoom. |

A successful contour response can contain zero features over flat terrain. A `zoom-in` response asks the caller to narrow the viewport. `not-installed` and `no-data` identify an unavailable archive and missing samples, respectively.

Adjacent installed regional elevation archives can form one native sampling grid for the requested view. The vertical interval stays 100 m. If regional coverage is incomplete, the service chooses a coherent worldwide grid when available instead of mixing elevations sampled at different zooms. Composite responses can include optional `sourceCount`, `regionalSourceCount` and `coverage` metadata, so callers can report which data actually produced the contours.

Invalid query values return HTTP 422. An unreadable installed archive returns HTTP 503. Visible contour geometry has a bounded work budget. The service caches geographic blocks by the installed archive revision. Callers can keep displaying the current result while a new view loads and cancel obsolete requests when the view changes. Invalidate cached results when the installed package changes.

## Manage an operation

All POST paths below are relative to `/api/maps/world-offline`. Send JSON with the field shown. Obtain package and operation IDs from inventory.

Writes accept local peers. Browsers must use the NOMAD origin with a loopback or private IP address, or the operator's configured `URL`. For a reverse proxy, configure `URL` to the browser-facing scheme, host and port. The worker token is used only between NOMAD and the download worker.

| Path | Body | Meaning |
| --- | --- | --- |
| `/download` | `{"packIds":["…"]}` | Submit one catalog package. Selecting a lower level of an installed family can queue a local reduction. |
| `/remove` | `{"packId":"…"}` | Remove the selected active package after validation. Obtain explicit operator confirmation first. |
| `/pause` | `{"id":"…"}` | Request a pause for the current eligible operation. |
| `/resume` | `{"id":"…"}` | Resume a paused operation. |
| `/cancel` | `{"id":"…"}` | Request cancellation. |
| `/retry` | `{"id":"…"}` | Request another attempt for an eligible stopped operation. |
| `/discard` | `{"id":"…"}` | Discard a failed or cancelled operation's checkpoint. Existing installed maps remain active. The result reports removed and reclaimed bytes. |

An accepted asynchronous request acknowledges the operation. Poll inventory until the matching operation reaches its terminal state. A pause or cancel request can take effect at a safe checkpoint. For installation or reduction, verify the targeted tier is active in inventory before using or backing it up. Preserve the most recent operation ID and refresh inventory after a conflict or a time-out before deciding whether to retry.

Read the generated response schemas for state and error fields. Distinguish transfer bytes, bytes remaining, storage in use, and temporary free-space requirements. The installed-map state can remain available when transfers are disabled or their provider is unreachable. See [World offline maps](/docs/world-offline) for the equivalent flows in Maps Manager.

## Delete independent regional squares

Regional squares use the separate `/api/maps/local-detail` API and storage. After explicit operator confirmation, `POST /api/maps/local-detail/delete` with `{"cells":[{"x":41,"y":93}]}` removes only those squares' managed regional archives. Up to 64 coordinates are accepted per request. It needs the local worker, but no internet, provider lookup or download estimate. The same local peer, origin and JSON write policy applies.

HTTP 200 returns `removed`, `alreadyAbsent`, `freedBytes`, `cleanupPending`, `generation` and `job`. Removal from inventory is atomic before disk unlinking. Nonempty `cleanupPending` means some local cleanup is unfinished: show a warning and repeat the same cells to retry. The operation is idempotent, and both inventory and restart recovery retain the pending coordinates. Never interpret an absent square as permission to delete arbitrary files.

HTTP 409 means a download thread is still running (including cancellation wind-down), or an old estimate must be recalculated after deletion. HTTP 422 rejects invalid coordinates or unsafe archive ownership. Worldwide files, unselected squares and Pins are outside this endpoint's ownership. See [Regional offline maps](/docs/local-detail) for panel behavior.

## Queue and recover regional preparation

The same local same-origin JSON policy applies to all `/api/maps/local-detail` mutations. Calculate selections in batches of up to 64, then submit `POST /queue` with `{"batches":[{"quoteId":"…","excludedCells":["8/41/93"]}],"requestId":"stable-caller-id"}`. Omit `excludedCells` to admit its whole quote. All referenced estimates are validated before one persistent admission commit; conflicting duplicate coordinates or stale estimates reject the entire admission. At most 1024 batches cover the finite z8 grid. The worker accepts up to 1 MiB only for this endpoint; ordinary operations keep their 8 KiB bound. Response HTTP 202 contains `queue` and `job`. Refresh inventory and compare `queue.requestId` after a timeout before resubmitting.

The queue processes one batch at a time and reports `batchIndex`, `totalBatches`, `completedCells`, `totalCells`, per-batch status and `recovery`. Verified squares remain published after cancellation or restart. `POST /retry` with the stopped queue or job `id` prepares only the remainder. If `recovery.canPrepareOffline` is true, saved ranges are verified locally before use, including after the estimate's 24-hour TTL; no provider is contacted. A checksum or inventory mismatch is not an invitation to silently change the source revision.

When `recovery.needsRecalculation` is true, `POST /recalculate` with `{id}` returns authoritative remaining `cells`, excludes already installed squares and clears in-memory provider discovery. Calculate those cells, review the new sizes and confirm a new queue. No download begins at the recalculation step. Public source rotation (404/410/412) uses this flow.

## Regional maintenance and discard

The worker performs automatic expired-metadata maintenance at startup and once per day while idle, independently of browser sessions. It removes only unreferenced expired estimates (24 hours) and recognized source indexes older than seven days. Current resume estimates, saved source ranges, active downloads and source estimation are protected. Routine outcomes and failures are written to worker logs; a maintenance failure does not make installed maps unavailable.

Inventory `temporaryStorage` remains available for API clients. It reports reclaimable `savedPreparationBytes` and `expiredMetadataBytes`, their `totalBytes`, active-work protection and available cleanup capabilities. The Maps Manager uses the saved-preparation amount and opaque `discardId` only when reviewing a contextual **Discard download** action. It does not expose a routine temporary-storage panel.

`POST /cleanup` with `{"scope":"saved-preparation","id":"<discardId>"}` requires explicit confirmation of abandoning the stopped download and losing its saved preparation. The opaque inventory token binds the request to the reviewed task and file identities; HTTP 409 asks for a new review if they changed. Success removes the stopped job and queue and returns `job: null` and `queue: null`. It is also valid when `savedPreparationBytes` is zero but a failed or cancelled task remains. That task's coordinates are no longer offered for retry or recalculation. Installed squares are preserved.

`POST /cleanup` with `{"scope":"expired-metadata"}` remains available for operator diagnostics, using the same protected cleanup as automatic maintenance.

Discard records its confirmation before removing saved files. A pending record is retried during maintenance, including startup. This is recovery of a prior explicit discard, not permission to expire resumable preparation. New calculations and admissions return HTTP 409 until pending discard cleanup is finished. Repeating an acknowledged completed discard with its same token is harmless when no newer task exists.

Neither scope owns installed regional/world archives or Pins. Unknown files and symlinks are preserved. Cleanup is local and returns reclaimed bytes; refresh inventory before retrying a failed discard.
