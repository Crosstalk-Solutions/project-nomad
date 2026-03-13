<div align="center">
<img src="https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/admin/public/project_nomad_logo.png" width="200" height="200"/>

# Project N.O.M.A.D. — Homelab Edition
### Network Operations Monitoring and Automation Dashboard

**Knowledge That Never Goes Offline — Now Container-Native for Your Homelab**

[![Website](https://img.shields.io/badge/Website-projectnomad.us-blue)](https://www.projectnomad.us)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2)](https://discord.com/invite/crosstalksolutions)
[![Benchmark](https://img.shields.io/badge/Benchmark-Leaderboard-green)](https://benchmark.projectnomad.us)

</div>

---

Project N.O.M.A.D. Homelab Edition is a container-native fork of [Project N.O.M.A.D.](https://github.com/CrosstalkSolutions/project-nomad), optimized for NAS systems and homelab environments. It runs as a portable Docker Compose stack on **Unraid**, **TrueNAS SCALE**, and any standard Docker host.

## Quick Start (Docker Compose)

```bash
# 1. Clone the repository
git clone https://github.com/DocwatZ/project-nomad-homelab-edition.git
cd project-nomad-homelab-edition

# 2. Configure environment
cp .env.example .env
sed -i "s/^APP_KEY=replaceme/APP_KEY=$(openssl rand -hex 32)/" .env
sed -i "s/^DB_PASSWORD=replaceme/DB_PASSWORD=$(openssl rand -base64 24)/" .env
sed -i "s/^MYSQL_ROOT_PASSWORD=replaceme/MYSQL_ROOT_PASSWORD=$(openssl rand -base64 24)/" .env

# 3. Create data directories
sudo mkdir -p /opt/project-nomad/{storage,redis,logs/nginx}

# 4. Start the stack
docker compose up -d
```

Open `http://localhost:8080` to access the dashboard.

## Container Architecture

| Service | Image | Purpose |
|---------|-------|---------|
| **nomad-app** | project-nomad | Web UI + API server |
| **nomad-worker** | project-nomad | Background job processing |
| **nomad-database** | mysql:8.0 | Persistent data storage |
| **nomad-cache** | redis:7-alpine | Cache + job queues |
| **nomad-nginx** | nginx:alpine | Reverse proxy |

All services communicate over a private Docker network (`nomad-internal`).

## NAS Compatibility

| Platform | Storage Path | Guide |
|----------|-------------|-------|
| **Unraid** | `/mnt/user/appdata/project-nomad` | [Unraid Guide](docs/homelab/unraid-guide.md) |
| **TrueNAS SCALE** | `/mnt/pool/apps/project-nomad` | [TrueNAS Guide](docs/homelab/truenas-guide.md) |
| **Linux** | `/opt/project-nomad` | [Installation Guide](docs/homelab/installation-guide.md) |

### NAS Install Templates

- **Unraid**: [Community Apps XML template](homelab/unraid-template.xml)
- **TrueNAS SCALE**: [Helm chart](homelab/truenas/)
- **Any Docker host**: [docker-compose.yml](docker-compose.yml)

## Storage Layout

```
NOMAD_DATA_DIR/
├── storage/          # Content files (ZIM, maps, uploads) — NAS share OK
├── redis/            # Redis persistence
└── logs/
    └── nginx/        # Nginx access/error logs
```

The MySQL database uses a **Docker named volume** for optimal I/O, avoiding NFS/SMB latency.

## Reverse Proxy Support

Works behind common homelab reverse proxies:

| Proxy | Configuration |
|-------|--------------|
| **Nginx Proxy Manager** | [Setup guide](homelab/reverse-proxy-examples/nginx-proxy-manager.md) |
| **Traefik** | [Traefik config](homelab/reverse-proxy-examples/traefik.yml) |
| **Caddy** | [Caddyfile](homelab/reverse-proxy-examples/caddy.Caddyfile) |

## Monitoring Agent

Deploy lightweight monitoring agents on homelab nodes:

```bash
docker run -d --name nomad-agent \
  -p 9100:9100 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /proc:/host/proc:ro \
  -e NODE_NAME=my-server \
  nomad-agent
```

Features: CPU/RAM/disk metrics, Docker container monitoring, Prometheus `/metrics` endpoint.

See the [Agent Guide](docs/homelab/agent-guide.md) for details.

## What's Included

| Capability | Powered By | What You Get |
|-----------|-----------|-------------|
| Information Library | Kiwix | Offline Wikipedia, medical references, survival guides, ebooks |
| AI Assistant | Ollama + Qdrant | Built-in chat with document upload and semantic search |
| Education Platform | Kolibri | Khan Academy courses, progress tracking, multi-user support |
| Offline Maps | ProtoMaps | Downloadable regional maps with search and navigation |
| Data Tools | CyberChef | Encryption, encoding, hashing, and data analysis |
| Notes | FlatNotes | Local note-taking with markdown support |
| System Benchmark | Built-in | Hardware scoring, Builder Tags, and community leaderboard |

## Device Requirements

#### Minimum Specs
- 2 GHz dual-core processor
- 4 GB RAM (8 GB recommended)
- 5 GB free disk space
- Docker 20.10+ and Docker Compose v2+
- Any Linux, Unraid, or TrueNAS SCALE host

#### Optimal Specs
- AMD Ryzen 7 / Intel Core i7 or better
- 32 GB RAM
- NVIDIA RTX 3060+ (for AI features)
- 250 GB SSD
- Stable internet connection (for initial content downloads)

## Documentation

| Guide | Description |
|-------|-------------|
| [Installation Guide](docs/homelab/installation-guide.md) | Docker Compose setup |
| [Unraid Guide](docs/homelab/unraid-guide.md) | Unraid-specific installation |
| [TrueNAS Guide](docs/homelab/truenas-guide.md) | TrueNAS SCALE installation |
| [Agent Guide](docs/homelab/agent-guide.md) | Monitoring agent setup |
| [Architecture](docs/homelab/architecture.md) | System design and data flow |
| [Monitoring](docs/homelab/monitoring.md) | Monitoring stack and Prometheus integration |

## Configuration

All configuration is handled through environment variables in `.env`. See [`.env.example`](.env.example) for all options.

Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_KEY` | — | Encryption key (**required**) |
| `DB_PASSWORD` | — | Database password (**required**) |
| `URL` | http://localhost:8080 | External access URL |
| `NOMAD_DATA_DIR` | /opt/project-nomad | Host storage directory |
| `PORT` | 8080 | Application port |
| `LOG_LEVEL` | info | Log verbosity |

## Updating

```bash
docker compose pull
docker compose up -d
```

## About Internet Usage & Privacy
Project N.O.M.A.D. is designed for offline usage. An internet connection is only required during the initial installation (to download dependencies) and if you (the user) decide to download additional tools and resources at a later time. Otherwise, N.O.M.A.D. does not require an internet connection and has ZERO built-in telemetry.

## Contributing
Contributions are welcome and appreciated! Please read the [Contributing Guide](CONTRIBUTING.md) for details.

This project uses semantic versioning. The version is managed in the root `package.json`
and automatically updated by semantic-release.

## Community & Resources

- **Website:** [www.projectnomad.us](https://www.projectnomad.us)
- **Discord:** [Join the Community](https://discord.com/invite/crosstalksolutions)
- **Benchmark Leaderboard:** [benchmark.projectnomad.us](https://benchmark.projectnomad.us)

## License

Project N.O.M.A.D. is licensed under the [Apache License 2.0](LICENSE).