# API Reference

N.O.M.A.D. exposes a REST API for all operations. All endpoints are under `/api/` and return JSON.

---

## Conventions

**Base URL:** `http://<your-server>/api`

**Responses:**
- Success responses include `{ "success": true }` and an HTTP 2xx status
- Error responses return the appropriate HTTP status (400, 404, 409, 500) with an error message
- Long-running operations (downloads, benchmarks, embeddings) return 201 or 202 with a job/benchmark ID for polling

**Async pattern:** Submit a job → receive an ID → poll a status endpoint until complete.

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Returns `{ "status": "ok" }` |

---

## System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/system/info` | CPU, memory, disk, and platform info |
| GET | `/api/system/internet-status` | Check internet connectivity |
| GET | `/api/system/debug-info` | Detailed debug information |
| GET | `/api/system/latest-version` | Check for the latest N.O.M.A.D. version |
| POST | `/api/system/update` | Trigger a system update |
| GET | `/api/system/update/status` | Get update progress |
| GET | `/api/system/update/logs` | Get update operation logs |
| GET | `/api/system/settings` | Get a setting value (query param: `key`) |
| PATCH | `/api/system/settings` | Update a setting (`{ key, value }`) |
| POST | `/api/system/subscribe-release-notes` | Subscribe an email to release notes |

### Services

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/system/services` | List all services with status |
| POST | `/api/system/services/install` | Install a service |
| POST | `/api/system/services/force-reinstall` | Force reinstall a service |
| POST | `/api/system/services/affect` | Start, stop, or restart a service (body: `{ name, action }`) |
| POST | `/api/system/services/check-updates` | Check for available service updates |
| POST | `/api/system/services/update` | Update a service to a specific version |
| GET | `/api/system/services/:name/available-versions` | List available versions for a service |

---

## AI Chat

### Models

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ollama/models` | List available models (supports filtering, sorting, pagination) |
| GET | `/api/ollama/installed-models` | List locally installed models |
| POST | `/api/ollama/models` | Download a model (async, returns job) |
| DELETE | `/api/ollama/models` | Delete an installed model |

### Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ollama/chat` | Send a chat message. Supports streaming (SSE) and RAG context injection. Body: `{ model, messages, stream?, useRag? }` |
| GET | `/api/chat/suggestions` | Get suggested chat prompts |

### Remote Ollama

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ollama/configure-remote` | Configure a remote Ollama or LM Studio instance |
| GET | `/api/ollama/remote-status` | Check remote Ollama connection status |

### Chat Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/chat/sessions` | List all chat sessions |
| POST | `/api/chat/sessions` | Create a new session |
| GET | `/api/chat/sessions/:id` | Get a session with its messages |
| PUT | `/api/chat/sessions/:id` | Update session metadata (title, etc.) |
| DELETE | `/api/chat/sessions/:id` | Delete a session |
| DELETE | `/api/chat/sessions/all` | Delete all sessions |
| POST | `/api/chat/sessions/:id/messages` | Add a message to a session |

**Streaming:** The `/api/ollama/chat` endpoint supports Server-Sent Events (SSE) when `stream: true` is passed. Connect using `EventSource` or `fetch` with a streaming reader.

---

## Knowledge Base (RAG)

Upload documents to enable AI-powered retrieval during chat.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/rag/upload` | Upload a file for embedding (async, 202 response) |
| GET | `/api/rag/files` | List stored RAG files |
| DELETE | `/api/rag/files` | Delete a file (query param: `source`) |
| GET | `/api/rag/active-jobs` | List active embedding jobs |
| GET | `/api/rag/job-status` | Get status for a specific file embedding job |
| GET | `/api/rag/failed-jobs` | List failed embedding jobs |
| DELETE | `/api/rag/failed-jobs` | Clean up failed jobs and delete associated files |
| POST | `/api/rag/sync` | Scan storage and sync database with filesystem |

---

## ZIM Files (Offline Content)

ZIM files provide offline Wikipedia, books, and other content via Kiwix.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/zim/list` | List locally stored ZIM files |
| GET | `/api/zim/list-remote` | List remote ZIM files (paginated, supports search) |
| GET | `/api/zim/curated-categories` | List curated categories with Essential/Standard/Comprehensive tiers |
| POST | `/api/zim/download-remote` | Download a remote ZIM file (async) |
| POST | `/api/zim/download-category-tier` | Download a full category tier |
| DELETE | `/api/zim/:filename` | Delete a local ZIM file |

### Wikipedia

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/zim/wikipedia` | Get current Wikipedia selection state |
| POST | `/api/zim/wikipedia/select` | Select a Wikipedia edition and tier |

---

## Maps

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/maps/regions` | List available map regions |
| GET | `/api/maps/styles` | Get map styles JSON |
| GET | `/api/maps/curated-collections` | List curated map collections |
| POST | `/api/maps/fetch-latest-collections` | Fetch latest collection metadata from source |
| POST | `/api/maps/download-base-assets` | Download base map assets |
| POST | `/api/maps/download-remote` | Download a remote map file (async) |
| POST | `/api/maps/download-remote-preflight` | Check download size/info before starting |
| POST | `/api/maps/download-collection` | Download an entire collection by slug (async) |
| DELETE | `/api/maps/:filename` | Delete a local map file |

### Map Markers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/maps/markers` | List map markers |
| POST | `/api/maps/markers` | Add map marker (body: {"name": "Test Marker", "notes": "Example note", "longitude": 0.0, "latitude": 0.0, "color": "yellow", "marker_type": "pin"} ) |
| PATCH | `/api/maps/markers/{id}` | Update a  map marker (body: {"name": "Test Marker", "notes": "Example note", "longitude": 0.0, "latitude": 0.0, "color": "yellow", "marker_type": "pin"} ) fields that don't change can be omitted|
| DELETE | `/api/maps/markers/{id}` | Delete a map marker | 

---

## Downloads

Manage background download jobs for maps, ZIM files, and models.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/downloads/jobs` | List all download jobs |
| GET | `/api/downloads/jobs/:filetype` | List jobs filtered by type (`zim`, `map`, etc.) |
| DELETE | `/api/downloads/jobs/:jobId` | Cancel and remove a download job |

---

## Benchmarks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/benchmark/run` | Run a benchmark (`full`, `system`, or `ai`; can be async) |
| POST | `/api/benchmark/run/system` | Run system-only benchmark |
| POST | `/api/benchmark/run/ai` | Run AI-only benchmark |
| GET | `/api/benchmark/status` | Get current benchmark status (`idle` or `running`) |
| GET | `/api/benchmark/results` | Get all benchmark results |
| GET | `/api/benchmark/results/latest` | Get the most recent result |
| GET | `/api/benchmark/results/:id` | Get a specific result |
| POST | `/api/benchmark/submit` | Submit a result to the central repository |
| POST | `/api/benchmark/builder-tag` | Update builder tag metadata for a result |
| GET | `/api/benchmark/comparison` | Get comparison stats from the repository |
| GET | `/api/benchmark/settings` | Get benchmark settings |
| POST | `/api/benchmark/settings` | Update benchmark settings |

---

## Easy Setup & Content Updates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/easy-setup/curated-categories` | List curated content categories for setup wizard |
| POST | `/api/manifests/refresh` | Refresh manifest caches (`zim_categories`, `maps`, `wikipedia`) |
| POST | `/api/content-updates/check` | Check for available collection updates |
| POST | `/api/content-updates/apply` | Apply a single content update |
| POST | `/api/content-updates/apply-all` | Apply multiple content updates |

---

## Documentation

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/docs/list` | List all available documentation files |
