# World offline API

The [interactive API reference](/reference) and the [OpenAPI document](/api/openapi.json) describe the contract served by your NOMAD. Use the documented maps access policy on the same NOMAD that holds the archives.

## Read inventory

`GET /api/maps/world-offline` reports the catalog, installed levels, available disk space when known, and current operation if present. The response identifies the active tier and lower levels already included in it. A higher level can require a full download or just missing data depending on the provider and package format.

The offline inventory can keep reporting verified local archives while the download service is unavailable. In that state, the response can omit worker-only details such as an active transfer or a free-space estimate. Treat missing estimates as unknown and use the availability field before calling mutations.

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
