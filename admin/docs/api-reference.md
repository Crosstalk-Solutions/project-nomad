# API Reference

NOMAD exposes a REST API for all operations. All endpoints are under `/api/` and return JSON.

---

## Interactive reference

The full, always-current endpoint reference is generated directly from the application's
routes and validators and served as an interactive [Scalar](https://scalar.com) UI:

- **[/reference](/reference)** — browse every endpoint, request/response schema, and try calls live
- **[/api/openapi.json](/api/openapi.json)** — the raw OpenAPI 3.1 document (import into Postman, Insomnia, codegen, etc.)

It is derived from the application's route metadata and VineJS validators. Prefer it for
request/response schemas; the notes below explain behavior that a schema alone cannot express.

## Maps contracts

The [maps API group](/reference#tag/maps) describes the offline region catalog, effective coverage,
component installation/removal, operation progress/retry, transfer estimates, cancellation, source update checks, catalog refresh, coordinate-based routing and routing preferences.
Response shapes are endpoint-specific: catalogs and calculated routes are direct
JSON payloads rather than a shared success envelope. Domain errors use a `message` field.

Region availability, component preparation and update freshness are separate fields. Inspect
`providedBy` before managing inherited coverage, and use graph IDs and versions from the routing
coverage endpoint for an explicitly selected route. Update checks never install replacements.

`pendingProvider` reserves compatible descendant components while their ancestor is queued or being prepared. Cancellation returns 202 for a request; inspect `cancelling`/`cancelled` in the catalog for acknowledgement. Transfer estimates deduplicate shared source inputs and identify stale metadata. Routing settings persist on this NOMAD; an explicit region in a route request overrides the saved preference.

The [Maps guide](/docs/maps) explains the user flow, source-defined hierarchy, data provenance,
coordinate order and offline behavior. Map API contracts are general local HTTP interfaces and do
not depend on a chat or MCP client.

### Coordinates

Coordinates are parsed locally by map clients. Send WGS84 `{lat, lon}` points directly to the routing API; a database lookup is not required. Saved Pins and the optional browser-local Base recall their stored coordinates. Typed names and CEP/ZIP/postal codes do not resolve locations.

### Country and regional route packages

`POST /api/maps/regions/install` accepts `components: ["routing"]` for a published country or subregion. A request to prepare Brazil uses this body.

```json
{ "regionId": "brazil", "components": ["routing"] }
```

Catalog `territoryScope` is `country`, `subregion`, `collection` or `multi_country`. `countryCodes` records its country classification from provider and registry metadata. A country or subregion installation belongs to one country. World, continents, cross-country packages and unclassified collections are groups for browsing.

The source is a public OSM PBF. Installation automatically verifies/reuses a matching completed local source or downloads it, prepares the graph, validates it and publishes the immutable version. No manual second preparation or search-index prerequisite is required. Keep transfer size, source bytes, installed graph size and preparation-space estimates distinct. A cached-source estimate with zero remaining bytes does not mean the graph is already prepared.

### Offline route calculation

`POST /api/maps/route` accepts an ordered `locations` array of **2–7 WGS84 `{lat, lon}` points**, A–G. The first is the origin, the last is the final destination, and there can be five intermediate stops. `profile` is `auto` or `pedestrian`; `automatic: true` chooses an eligible installed graph, subject to a saved fixed preference unless an explicit namespaced `regionId` is supplied. Each consecutive pair produces a leg, so seven points produce six legs. Existing two-point and prepared-pack clients remain supported.

Responses retain total geometry, distance, duration and maneuvers, with `legs` containing `fromIndex`, `toIndex`, leg distance/duration and maneuvers. Points and leg indexes preserve the request order; routes never join separate installed graphs. Maneuvers and browser-generated text exports are in English, while proper street/place names remain unchanged. No stop dwell time or live traffic is included.

Map links accept `origin`, `destination` and contiguous `via1` through `via5`, each `latitude,longitude`. Duplicate vias, gaps and more than seven points are invalid. Older links using zero, one or two vias retain their meaning. Links only calculate when `autoroute=1` is explicitly requested.

Route-domain failures return `message`, a stable `code`, and optional `engineCode` / `distanceLimitMeters`. Validation failures can instead return Vine's `errors` array.

| Code                                         | Meaning / response                                                                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OUTSIDE_COVERAGE`                           | 422: no eligible installed graph covers every selected point; choose a graph covering the whole journey.                                                                                                    |
| `DISTANCE_LIMIT_EXCEEDED`                    | 422, Valhalla 154: the selected profile exceeds its configured request-distance limit; calculate shorter journeys separately. Current walking limit is 250,000 meters. This is not missing geographic data. |
| `UNCONNECTED_POINTS`, `NO_PATH`              | 422: the graph covers the points but has no connected path for the requested travel mode.                                                                                                                   |
| `NO_ROUTABLE_EDGE`                           | 422: no usable edge near a selected point for that mode; try a nearby usable road/path.                                                                                                                     |
| `ENGINE_BUSY`, `ENGINE_UNAVAILABLE`          | 503: retry or check the local navigation service.                                                                                                                                                           |
| `ENGINE_TIMEOUT`                             | 504: retry or calculate shorter sections.                                                                                                                                                                   |
| `ENGINE_REJECTED`, `ENGINE_INVALID_RESPONSE` | 422/502: the engine rejected the request or returned invalid data.                                                                                                                                          |

Coverage, connectivity, access and profile limits are different causes. A car route can succeed where walking is limited or disallowed. Requests use one country/subregion graph; plan separate country sections for cross-border journeys. Adding intermediate points does not bypass a whole-request distance limit, and NOMAD never silently switches travel mode or calls an online router.

### Observe and retry map operations

`GET /api/maps/operations` reads local queue/builder state without advancing the work, contacting
public data providers or scanning full source/artifact files. It returns a direct object with
`observedAt` and `operations: [{ regionId, name, components }]`. Each routing
component includes its current state and an optional `operation`. Installed components disappear
from this active/attention list after successful publication; inspect the region catalog to
confirm their installed versions. A source download at 100% is not an installed component.

The operation fields are optional when an older preparer cannot report them:

| Field                                                               | Meaning                                                                                                                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `type`                                                        | Operation generation and intent: `install` or `source_update`; retired generations can remain in historical metadata.                                                |
| `phase`                                                             | Current step: connecting/downloading, queued, verifying/reading source, building routes, validating, publishing or ready; terminal/uncertain states remain explicit. |
| `sourceMode`, `transferComplete`                                    | `cached` or `download`, and whether source transfer has finished. Cached preparation is separate from an online source update.                                       |
| `activity`, `telemetry`                                             | `active`, `waiting`, `no_recent_progress` or `unavailable`; `reported` versus a `legacy` projection with fewer measurements.                                         |
| `queuedAt`, `startedAt`, `phaseStartedAt`                           | Available UTC timestamps for queueing, worker start and the current step.                                                                                            |
| `heartbeatAt`, `lastProgressAt`                                     | Worker/service responsiveness versus actual advancing work. A heartbeat alone is not a progress measurement.                                                         |
| `bytesTransferred`, `totalBytes`, `rateBytesPerSecond`              | Measured source transfer bytes/total/rate. These are not local graph-output bytes.                                                                                   |
| `stageBytesProcessed`, `stageTotalBytes`, `stageRateBytesPerSecond` | Optional current-step counters. Source/artifact verification uses bytes actually read for hashing; graph preparation may report activity without a total.            |
| `recordsProcessed`, `recordsTotal`, `recordsPerSecond`              | Reported work counters. Missing totals mean the preparer cannot provide a reliable denominator.                                                                      |
| `etaSeconds`                                                        | Optional estimate for a measured step with a known total; not a promise for the whole operation.                                                                     |
| `workBytes`, `workRateBytesPerSecond`, `activityEvidence`           | Optional local working-file activity, distinct from measured input progress. File growth does not establish a completion percentage or remaining time.               |
| `queueReason`, `waitingFor`, `queuePosition`                        | Available queue/dependency context; a waiting job can retain a historical interrupted builder attempt.                                                               |
| `attempt`, `retryable`, `errorCode`, `detail`                       | Attempt/context, whether retry is safe, a machine-readable error classification and a short step token.                                                              |

Treat unknown totals as indeterminate and stale/unavailable status as uncertainty. Do not infer
failure from an unchanged percentage or heartbeat. Counter/rate fields apply to a step and can
reset when the phase/detail changes. Legacy service responsiveness is not proof that its native
child process has advanced. A reported historical builder failure must not override a newer
operation generation or a job that is currently waiting in the queue.

`POST /api/maps/regions/retry` retries stopped work while preserving its original intent:

```json
{ "regionId": "andorra", "components": ["routing"] }
```

`components` is optional; when omitted, the stopped routing component is selected.
Acceptance returns **202** with `{ "success": true }`, not a new public job ID. The server first
confirms that the previous preparation stopped. An active, changing or unconfirmed operation
cannot be safely retried. Respect `retryable`; refresh uncertain status instead of repeatedly
submitting retry requests.

A captured completed source is validated and reused locally without a provider HEAD or download.
Its source digest, definition and provenance remain attached to the retry. An unavailable or
changed cache returns an error rather than silently selecting newer data. An incomplete original
transfer can still require connectivity and a supported range response. Use `/regions/check-updates` and `/regions/update` explicitly to check/install newer
public source data; retry does not convert a captured operation into a source update.

Expected retry errors include **409** for an operation that is not stopped or whose original
cache is unavailable, **422** for insufficient preparation space and **503** when stopped state
cannot be confirmed. Request validation may also return **400/422**. Cancel via
`POST /api/maps/regions/cancel`; its **202** acknowledges the request, and the stopped state must
still be polled. Cancellation/failure/retry preserve any previously installed version until a
verified replacement is published.

---

## Region workflows and phase estimates

A new territory install/source update creates a routing task with a stable operation generation. It automatically advances through source transfer/reuse, verification, graph preparation and publication. `operation.workflowId` and `operation.workflowComponents` can correlate that task; new requests contain routing only. There is no search/postal dependency.

A matching completed local source can be reused without a provider HEAD request or new transfer. An explicit source update still checks its public input. Cancellation and retry preserve installed graphs until a verified replacement is published. The previous attempt must stop before retrying.

Optional `phaseEtaMinSeconds` / `phaseEtaMaxSeconds` describe
**remaining time for the current phase and detail only**, never the whole region. `etaBasis: "measured"` uses recent measured
counters with a known total. `etaBasis: "history"` uses at least three comparable completed
measurements on this NOMAD, grouped by component, phase/detail, source format and similar source
size; `etaSamples` identifies that sample count. `sourceFormat` and `sourceBytes` identify the
scale used for this estimate. Waiting, failed, stale or unavailable activity does not get a
phase estimate. Estimates can be withdrawn when a phase outlives its observed range; absence
means insufficient evidence, not zero remaining time. No global percentage is inferred from
these estimates.

Offline route maneuvers default to English. Street and place names retain their proper names.

## Conventions

**Base URL:** `http://<your-server>/api`

**Responses:**

- Success responses use an HTTP 2xx status and the endpoint's documented payload; some include
  `{ "success": true }`, while map catalogs and calculated routes return direct objects.
- Domain errors include `message` and the appropriate HTTP status. Request-validation failures
  can return an `errors` array; inspect the endpoint's schema.
- Long-running operations commonly return 201 or 202. Poll the documented job or resource status;
  not every operation returns a job ID.

**Async pattern:** Submit an operation → receive acceptance → poll its documented status until
complete, failed or cancelled.
