# API Reference

NOMAD exposes a REST API for all operations. All endpoints are under `/api/` and return JSON.

---

## Interactive reference

The full, always-current endpoint reference is generated directly from the application's
routes and validators and served as an interactive [Scalar](https://scalar.com) UI:

- **[/reference](/reference)** — browse every endpoint, request/response schema, and try calls live
- **[/api/openapi.json](/api/openapi.json)** — the raw OpenAPI 3.1 document (import into Postman, Insomnia, codegen, etc.)

Because it is derived from the same VineJS validators the API validates against, it never drifts
from the implementation. Prefer it over any hand-written endpoint list.

The [World offline API notes](/docs/world-offline-api) explain package management and local 100 m contour queries. The [World offline manual](/docs/world-offline) covers the corresponding Maps controls.

---

## Conventions

**Base URL:** `http://<your-server>/api`

**Responses:**
- Successful responses use HTTP 2xx. The response body follows the operation's OpenAPI schema.
- Error responses return the appropriate HTTP status (400, 404, 409, 500) with an error message
- Long-running operations (downloads, benchmarks, embeddings) return 201 or 202 with a job/benchmark ID for polling

**Async pattern:** Submit a job → receive an ID → poll a status endpoint until complete.
