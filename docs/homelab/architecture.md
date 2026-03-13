# Project N.O.M.A.D. — Homelab Edition: Architecture

## System Overview

Project N.O.M.A.D. Homelab Edition is a container-native knowledge platform designed for NAS and homelab environments. The architecture prioritizes reliability, minimal resource usage, and compatibility with storage-backed systems.

## Container Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Host / NAS                        │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   nomad-internal network                   │ │
│  │                                                            │ │
│  │  ┌──────────────┐    ┌──────────────┐    ┌─────────────┐  │ │
│  │  │  nomad-nginx  │    │  nomad-app   │    │nomad-worker │  │ │
│  │  │  (Nginx)      ├───►│  (AdonisJS)  │    │ (Queue Jobs)│  │ │
│  │  │  :80/:443     │    │  :8080       │    │             │  │ │
│  │  └──────────────┘    └──────┬───────┘    └──────┬──────┘  │ │
│  │                             │                   │          │ │
│  │                      ┌──────▼───────┐    ┌──────▼──────┐  │ │
│  │                      │nomad-database│    │ nomad-cache  │  │ │
│  │                      │  (MySQL 8.0) │    │ (Redis 7)   │  │ │
│  │                      │  :3306       │    │ :6379       │  │ │
│  │                      └──────────────┘    └─────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Volumes:                                                       │
│  ├── nomad-db-data (Docker volume - local SSD)                  │
│  ├── NOMAD_DATA_DIR/storage (bind mount - NAS share)            │
│  ├── NOMAD_DATA_DIR/redis (bind mount)                          │
│  └── NOMAD_DATA_DIR/logs/nginx (bind mount)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Service Roles

### nomad-app (Application Server)

- **Technology:** Node.js 22 + AdonisJS 6
- **Role:** Serves the web UI (React/Inertia), handles API requests, manages content
- **Port:** 8080
- **Dependencies:** nomad-database, nomad-cache

### nomad-worker (Background Worker)

- **Technology:** Same image as nomad-app
- **Role:** Processes background jobs — content downloads, AI model downloads, embeddings, benchmarks
- **Queues:** downloads, model-downloads, benchmarks, embeddings
- **Dependencies:** nomad-database, nomad-cache

### nomad-database (Database)

- **Technology:** MySQL 8.0
- **Role:** Persistent storage for services, content metadata, chat sessions, benchmarks, settings
- **Storage:** Docker named volume (optimized for I/O)

### nomad-cache (Cache / Queue Broker)

- **Technology:** Redis 7 Alpine
- **Role:** BullMQ job queues, session cache, real-time event transport
- **Config:** AOF persistence, 256MB max memory with LRU eviction

### nomad-nginx (Reverse Proxy)

- **Technology:** Nginx Alpine
- **Role:** TLS termination, request routing, static asset caching, WebSocket proxy
- **Ports:** 80 (HTTP), 443 (HTTPS)

## Data Flow

### Content Download Pipeline

```
User Request
    │
    ▼
nomad-app (API) ──► nomad-cache (Redis Queue)
                         │
                         ▼
                    nomad-worker
                         │
                    Downloads content
                         │
                         ▼
                    /app/storage/
                    (NAS bind mount)
```

### AI Chat Pipeline

```
User Message
    │
    ▼
nomad-app ──► Ollama (AI Model)
    │              │
    │              ▼
    │         Response + RAG context
    │              │
    ▼              ▼
nomad-database (Chat History)
```

### Real-Time Updates

```
nomad-worker ──► nomad-cache (Redis Pub/Sub)
                      │
                      ▼
                 nomad-app (Transmit SSE)
                      │
                      ▼
                 Browser (EventSource)
```

## Storage Architecture

### Design Principles

1. **Database on local volume** — Docker named volume for high-IOPS MySQL operations
2. **Content on NAS share** — Bind mount to NAS storage for large files (ZIM, maps, PDFs)
3. **Logs rotated automatically** — Nginx logs on bind mount, easily accessible

### Storage Tiers

| Tier | Type | Use Case | I/O Profile |
|------|------|----------|-------------|
| **Hot** | Docker named volume | MySQL database | High IOPS, small writes |
| **Warm** | Bind mount (SSD/cache) | Redis, temp files | Medium IOPS |
| **Cold** | Bind mount (NAS array) | Content library, backups | Sequential reads, large files |

### NAS Compatibility

| Platform | Storage Path | Notes |
|----------|-------------|-------|
| **Unraid** | `/mnt/user/appdata/project-nomad` | Uses cache drive for DB |
| **TrueNAS SCALE** | `/mnt/pool/apps/project-nomad` | ZFS dataset recommended |
| **Linux** | `/opt/project-nomad` | Standard filesystem |
| **Synology** | `/volume1/docker/project-nomad` | Btrfs volume |

## Network Architecture

### Internal Network

All services communicate over the `nomad-internal` bridge network. Only the following ports are exposed to the host:

| Port | Service | Purpose |
|------|---------|---------|
| 80 | nomad-nginx | HTTP (configurable) |
| 443 | nomad-nginx | HTTPS (configurable) |
| 8080 | nomad-app | Direct app access (optional) |

### Reverse Proxy Compatibility

The stack works behind external reverse proxies:

```
Internet/LAN
    │
    ▼
┌───────────────────┐
│ External Proxy     │   Nginx Proxy Manager / Traefik / Caddy
│ (TLS termination)  │
└─────────┬─────────┘
          │
          ▼
┌─────────────────────┐
│ nomad-nginx (:80)   │   OR directly to nomad-app (:8080)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ nomad-app (:8080)   │
└─────────────────────┘
```

When using an external reverse proxy, you can disable `nomad-nginx`:

```yaml
# In docker-compose.yml override
services:
  nomad-nginx:
    profiles: ["proxy"]  # Only starts with --profile proxy
```

## Resource Requirements

### Minimum (8 GB RAM system)

| Service | RAM | CPU |
|---------|-----|-----|
| nomad-app | 256 MB | 0.25 cores |
| nomad-worker | 256 MB | 0.1 cores |
| nomad-database | 256 MB | 0.25 cores |
| nomad-cache | 64 MB | 0.05 cores |
| nomad-nginx | 16 MB | 0.01 cores |
| **Total** | **~850 MB** | **~0.66 cores** |

### Recommended (32 GB RAM system)

| Service | RAM | CPU |
|---------|-----|-----|
| nomad-app | 1 GB | 1 core |
| nomad-worker | 2 GB | 1 core |
| nomad-database | 1 GB | 0.5 cores |
| nomad-cache | 256 MB | 0.1 cores |
| nomad-nginx | 32 MB | 0.05 cores |
| **Total** | **~3.3 GB** | **~2.65 cores** |

## Security Model

- No authentication by default (network-level access control recommended)
- All inter-service communication on private Docker network
- Database and Redis not exposed to host by default
- Docker socket mounted read-only where possible
- Agent communication via shared secret (Bearer token)
