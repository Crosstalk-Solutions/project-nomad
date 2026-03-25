# Emergency Local API

## Purpose

This API exists to expose the emergency runtime to a local PWA over loopback only.

The API is not public and should not be exposed on the internet.

## Base URL

```text
http://127.0.0.1:4187/api/v1
```

## Core model

- Read operations are local-first.
- Base network policy is `ON` or `OFF`.
- One-shot sync is an explicit bounded exception path.

## Key endpoints

### `GET /status`

Returns high-level runtime state.

Example:

```json
{
  "network_policy": "OFF",
  "network": {
    "reachable": null,
    "last_checked_at": "2026-03-24T18:20:00Z",
    "probe_allowed": false
  },
  "oneshot": {
    "armed": true,
    "state": "armed",
    "scope": "manifests",
    "timeout_seconds": 600,
    "enforce_byte_cap": false,
    "byte_cap_mb": 0,
    "enforce_download_cap": false,
    "download_cap_count": 0,
    "armed_at": "2026-03-24T18:30:00Z",
    "expires_at": "2026-03-24T18:40:00Z"
  },
  "sync": {
    "state": "idle",
    "last_success_at": "2026-03-24T18:20:00Z"
  }
}
```

### `GET /mode`

Returns base network policy and one-shot state.

### `PUT /mode`

Sets base network policy.

Request:

```json
{
  "network_policy": "OFF"
}
```

Allowed values:

- `ON`
- `OFF`

### `POST /sync/oneshot`

Triggers or arms a bounded one-shot sync while leaving base policy unchanged.

Request:

```json
{
  "scope": "manifests",
  "reason": "manual",
  "arm_if_offline": true,
  "timeout_seconds": 600,
  "enforce_byte_cap": false,
  "byte_cap_mb": 0,
  "enforce_download_cap": false,
  "download_cap_count": 0
}
```

Behavior:

- if network is available now, queue one short sync job
- if network is unavailable and `arm_if_offline = true`, keep the request armed until timeout
- auto-disarm after one attempt, success, failure, or timeout

### `POST /sync/run`

Triggers a normal sync cycle.
This route is intended for policy `ON`.

### `GET /search`

Returns local search results only.

### `GET /documents/:document_id`

Returns locally stored document content and provenance metadata.

## Notes

- `network.reachable` may be `null` when active probing is suppressed by `OFF`.
- One-shot is the preferred explicit exception path from `OFF`.
- Cap fields are present in v1 but disabled by default until payload sizes are better understood.
