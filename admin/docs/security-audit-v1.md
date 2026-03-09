# Project NOMAD Security Audit Report

**Date:** 2026-03-08
**Version audited:** v1.28.0 (main branch)
**Auditor:** Claude Code (automated + manual review)
**Target:** Pre-launch security review

---

## Executive Summary

Project NOMAD's codebase is **reasonably clean for a LAN appliance**, with no critical authentication bypasses or remote code execution vulnerabilities. However, there are **4 findings that should be fixed before public launch** — all are straightforward path traversal and SSRF issues with known fix patterns already used elsewhere in the codebase.

| Severity | Count | Summary |
|----------|-------|---------|
| **HIGH** | 4 | Path traversal (3), SSRF (1) |
| **MEDIUM** | 5 | Dozzle shell, unvalidated settings read, content update URL injection, verbose errors, no rate limiting |
| **LOW** | 5 | CSRF disabled, CORS wildcard, debug logging, npm dep CVEs, hardcoded HMAC |
| **INFO** | 2 | No auth by design, Docker socket exposure by design |

---

## Scans Performed

| Scan | Tool | Result |
|------|------|--------|
| Dependency audit | `npm audit` | 2 CVEs (1 high, 1 moderate) |
| Secret scan | Manual grep (passwords, keys, tokens, certs) | Clean — all secrets from env vars |
| SAST | Semgrep (security-audit, OWASP, nodejs rulesets) | 0 findings (AdonisJS not in rulesets) |
| Docker config review | Manual review of compose, Dockerfiles, scripts | 2 actionable findings |
| Code review | Manual review of services, controllers, validators | 4 path traversal + 1 SSRF |
| API endpoint audit | Manual review of all 60+ routes | Attack surface documented |
| DAST (OWASP ZAP) | Skipped — Docker Desktop not running | Recommended as follow-up |

---

## FIX BEFORE LAUNCH

### 1. Path Traversal — ZIM File Delete (HIGH)

**File:** `admin/app/services/zim_service.ts:329-342`
**Endpoint:** `DELETE /api/zim/:filename`

The `filename` parameter flows into `path.join()` with no directory containment check. An attacker can delete `.zim` files outside the storage directory:

```
DELETE /api/zim/..%2F..%2Fsome-file.zim
```

**Fix:** Resolve the full path and verify it starts with the expected storage directory:

```typescript
async delete(file: string): Promise<void> {
  let fileName = file
  if (!fileName.endsWith('.zim')) {
    fileName += '.zim'
  }

  const basePath = join(process.cwd(), ZIM_STORAGE_PATH)
  const fullPath = resolve(basePath, fileName)

  // Prevent path traversal
  if (!fullPath.startsWith(basePath)) {
    throw new Error('Invalid filename')
  }

  // ... rest of delete logic
}
```

This pattern is already used correctly in `rag_service.ts:deleteFileBySource()`.

---

### 2. Path Traversal — Map File Delete (HIGH)

**File:** `admin/app/services/map_service.ts` (delete method)
**Endpoint:** `DELETE /api/maps/:filename`

Identical pattern to the ZIM delete. Same fix — resolve path, verify `startsWith(basePath)`.

---

### 3. Path Traversal — Documentation Read (HIGH)

**File:** `admin/app/services/docs_service.ts:61-83`
**Endpoint:** `GET /docs/:slug`

The `slug` parameter flows into `path.join(this.docsPath, filename)` with no containment check. An attacker can read arbitrary `.md` files on the filesystem:

```
GET /docs/..%2F..%2F..%2Fetc%2Fpasswd
```

Limited by the mandatory `.md` extension, but could still read sensitive markdown files outside the docs directory (like CLAUDE.md, README.md, etc.).

**Fix:**

```typescript
const basePath = this.docsPath
const fullPath = path.resolve(basePath, filename)

if (!fullPath.startsWith(path.resolve(basePath))) {
  throw new Error('Invalid document slug')
}
```

---

### 4. SSRF — Download Endpoints (HIGH)

**File:** `admin/app/validators/common.ts`
**Endpoints:** `POST /api/zim/download-remote`, `POST /api/maps/download-remote`, `POST /api/maps/download-base-assets`, `POST /api/maps/download-remote-preflight`

The download endpoints accept user-supplied URLs and the server fetches from them. Without validation, an attacker on the LAN (or via CSRF since `shield.ts` disables CSRF protection) could make NOMAD fetch from co-located services:
- `http://localhost:3306` (MySQL)
- `http://localhost:6379` (Redis)
- `http://169.254.169.254/` (cloud metadata — if NOMAD is ever cloud-hosted)

**Fix:** Added `assertNotPrivateUrl()` that blocks loopback and link-local addresses before any download is initiated. Called in all download controllers.

**Scope note:** RFC1918 private addresses (10.x, 172.16-31.x, 192.168.x) are intentionally **allowed** because NOMAD is a LAN appliance and users may host content mirrors on their local network. The `require_tld: false` VineJS option is preserved so URLs like `http://my-nas:8080/file.zim` remain valid.

```typescript
const blockedPatterns = [
  /^localhost$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^169\.254\.\d+\.\d+$/,  // Link-local / cloud metadata
  /^\[::1\]$/,
  /^\[?fe80:/i,             // IPv6 link-local
]
```

---

## FIX AFTER LAUNCH (Medium Priority)

### 5. Dozzle Web Shell Access (MEDIUM)

**File:** `install/management_compose.yaml:56`

```yaml
- DOZZLE_ENABLE_SHELL=true
```

Dozzle on port 9999 is bound to all interfaces with shell access enabled. Anyone on the LAN can open a web shell into containers, including `nomad_admin` which has the Docker socket mounted. This creates a path from "LAN access" → "container shell" → "Docker socket" → "host root."

**Fix:** Set `DOZZLE_ENABLE_SHELL=false`. Log viewing and container restart functionality are preserved.

---

### 6. Unvalidated Settings Key Read (MEDIUM)

**File:** `admin/app/controllers/settings_controller.ts`
**Endpoint:** `GET /api/system/settings?key=...`

The `updateSetting` endpoint validates the key against an enum, but `getSetting` accepts any arbitrary key string. Currently harmless since the KV store only contains settings data, but could leak sensitive info if new keys are added.

**Fix:** Apply the same enum validation to the read endpoint.

---

### 7. Content Update URL Injection (MEDIUM)

**File:** `admin/app/validators/common.ts:72-88`
**Endpoint:** `POST /api/content-updates/apply`

The `download_url` comes directly from the client request body. An attacker can supply any URL and NOMAD will download from it. The URL should be looked up server-side from the content manifest instead.

**Fix:** Validate `download_url` against the cached manifest, or apply the same loopback/link-local protections as finding #4 (already applied in this PR).

---

### 8. Verbose Error Messages (MEDIUM)

**Files:** `rag_controller.ts`, `docker_service.ts`, `system_update_service.ts`

Several controllers return raw `error.message` in API responses, potentially leaking internal paths, stack details, or Docker error messages to the client.

**Fix:** Return generic error messages in production. Log the details server-side.

---

### 9. No Rate Limiting (MEDIUM)

Zero rate limiting across all 60+ endpoints. While acceptable for a LAN appliance, some endpoints are particularly abusable:
- `POST /api/benchmark/run` — spins up Docker containers for CPU/memory/disk stress tests
- `POST /api/rag/upload` — file uploads (20MB limit per bodyparser config)
- `POST /api/system/services/affect` — can stop/start any service repeatedly

**Fix:** Consider basic rate limiting on the benchmark and service control endpoints (e.g., 1 benchmark per minute, service actions throttled to prevent rapid cycling).

---

## LOW PRIORITY / ACCEPTED RISK

### 10. CSRF Protection Disabled (LOW)

**File:** `admin/config/shield.ts`

CSRF is disabled, meaning any website a LAN user visits could fire requests at NOMAD's API. This amplifies findings 1-4 — path traversal and SSRF could be triggered by a malicious webpage, not just direct LAN access.

**Assessment:** Acceptable for a LAN appliance with no auth system. Enabling CSRF would require significant auth/session infrastructure changes.

### 11. CORS Wildcard with Credentials (LOW)

**File:** `admin/config/cors.ts`

`origin: ['*']` with `credentials: true`. Standard for LAN appliances.

### 12. npm Dependency CVEs (LOW)

```
tar  <=7.5.9     HIGH    Hardlink Path Traversal via Drive-Relative Linkpath
ajv  <6.14.0     MODERATE ReDoS when using $data option
```

Both fixable via `npm audit fix`. Low practical risk since these are build/dev dependencies not directly exposed to user input.

**Fix:** Run `npm audit fix` and commit the updated lockfile.

### 13. Hardcoded HMAC Secret (LOW)

**File:** `admin/app/services/benchmark_service.ts:35`

The benchmark HMAC secret `'nomad-benchmark-v1-2026'` is hardcoded in open-source code. Anyone can forge leaderboard submissions.

**Assessment:** Accepted risk. The leaderboard has compensating controls (rate limiting, plausibility validation, hardware fingerprint dedup). The secret stops casual abuse, not determined attackers.

### 14. Production Debug Logging (LOW)

**File:** `install/management_compose.yaml:22`

```yaml
LOG_LEVEL=debug
```

Debug logging in production can expose internal state in log files.

**Fix:** Change to `LOG_LEVEL=info` for production compose template.

---

## INFORMATIONAL (By Design)

### No Authentication

All 60+ API endpoints are unauthenticated. This is by design — NOMAD is a LAN appliance and the network boundary is the access control. Issue #73 tracks the edge case of public IP interfaces.

### Docker Socket Exposure

The `nomad_admin` container mounts `/var/run/docker.sock`. This is necessary for NOMAD's core functionality (managing Docker containers). The socket is not exposed to the network — only the admin container can use it.

---

## Recommendations Summary

| Priority | Action | Effort |
|----------|--------|--------|
| **Before launch** | Fix 3 path traversals (ZIM delete, Map delete, Docs read) | ~30 min |
| **Before launch** | Add SSRF protection to download URL validators | ~1 hour |
| **Soon after** | Disable Dozzle shell access | 1 line change |
| **Soon after** | Validate settings key on read endpoint | ~15 min |
| **Soon after** | Sanitize error messages in responses | ~30 min |
| **Nice to have** | Run `npm audit fix` | 5 min |
| **Nice to have** | Change production log level to info | 1 line change |
| **Follow-up** | OWASP ZAP dynamic scan against NOMAD3 | ~1 hour |

---

## What Went Right

- **No hardcoded secrets** — all credentials properly use environment variables
- **No command injection** — Docker operations use the Docker API (dockerode), not shell commands
- **No SQL injection** — all database queries use AdonisJS Lucid ORM with parameterized queries
- **No eval/Function** — no dynamic code execution anywhere
- **RAG service already has the correct fix pattern** — `deleteFileBySource()` uses `resolve()` + `startsWith()` for path containment
- **Install script generates strong random passwords** — uses `/dev/urandom` for APP_KEY and DB passwords
- **No privileged containers** — GPU passthrough uses DeviceRequests, not --privileged
- **Health checks don't leak data** — internal-only calls
