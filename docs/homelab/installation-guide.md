# Project N.O.M.A.D. — Homelab Edition: Installation Guide

## Overview

Project N.O.M.A.D. Homelab Edition runs as a Docker Compose stack, making it compatible with any system that supports Docker — including NAS platforms like Unraid and TrueNAS SCALE.

## Prerequisites

- **Docker** 20.10+ and **Docker Compose** v2+
- **4 GB RAM** minimum (8 GB+ recommended)
- **5 GB** free disk space (more for content downloads)
- Network access to pull Docker images

## Quick Start

### 1. Clone or Download

```bash
git clone https://github.com/DocwatZ/project-nomad-homelab-edition.git
cd project-nomad-homelab-edition
```

Or download and extract the ZIP from the GitHub releases page.

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Generate a secure application key
APP_KEY=$(openssl rand -hex 32)

# Generate a secure database password
DB_PASS=$(openssl rand -base64 24)

# Update .env with generated values
sed -i "s/^APP_KEY=replaceme/APP_KEY=$APP_KEY/" .env
sed -i "s/^DB_PASSWORD=replaceme/DB_PASSWORD=$DB_PASS/" .env
sed -i "s/^MYSQL_ROOT_PASSWORD=replaceme/MYSQL_ROOT_PASSWORD=$DB_PASS/" .env
```

Edit `.env` to set your external URL:

```bash
# Set to your server's IP or domain
URL=http://192.168.1.100:8080
```

### 3. Create Data Directories

```bash
# Default location (or set NOMAD_DATA_DIR in .env)
sudo mkdir -p /opt/project-nomad/{storage,redis,logs/nginx}
sudo chown -R 1000:1000 /opt/project-nomad
```

### 4. Start the Stack

```bash
docker compose up -d
```

### 5. Access the Dashboard

Open your browser and navigate to the URL you configured (default: `http://localhost:8080`).

If using the Nginx proxy: `http://localhost` (port 80).

## Service Architecture

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| **nomad-app** | Nomad application | 8080 | Web UI + API |
| **nomad-worker** | Background jobs | — | Queue processing |
| **nomad-database** | MySQL 8.0 | 3306 (internal) | Persistent data |
| **nomad-cache** | Redis 7 | 6379 (internal) | Cache + job queues |
| **nomad-nginx** | Nginx | 80, 443 | Reverse proxy |

## Volume Layout

```
NOMAD_DATA_DIR/
├── storage/          # Content files (ZIM, maps, uploads)
├── redis/            # Redis persistence
└── logs/
    └── nginx/        # Nginx access/error logs
```

The MySQL database uses a Docker named volume (`nomad-db-data`) for optimal I/O performance. This avoids latency issues common with NFS/SMB-backed storage on NAS systems.

## Updating

```bash
# Pull latest images
docker compose pull

# Recreate containers with new images
docker compose up -d
```

## Stopping

```bash
docker compose down
```

To also remove data volumes:

```bash
docker compose down -v
```

## Configuration Reference

See `.env.example` for all available configuration options. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Application port |
| `APP_KEY` | — | Encryption key (required) |
| `URL` | http://localhost:8080 | External access URL |
| `DB_PASSWORD` | — | Database password (required) |
| `NOMAD_DATA_DIR` | /opt/project-nomad | Host data directory |
| `LOG_LEVEL` | info | Logging verbosity |
| `NGINX_HTTP_PORT` | 80 | Nginx HTTP port |
| `NGINX_HTTPS_PORT` | 443 | Nginx HTTPS port |

## Troubleshooting

### Container won't start

```bash
# Check container logs
docker compose logs nomad-app

# Verify database is healthy
docker compose ps nomad-database
```

### Database connection errors

Ensure the database is healthy before the app starts. The compose file handles this with health checks, but on slow systems you may need to wait longer:

```bash
# Check database health
docker compose exec nomad-database mysqladmin ping -h localhost
```

### Permission issues on NAS

Ensure the storage directories are writable by the container user (UID 1000):

```bash
sudo chown -R 1000:1000 /path/to/your/storage
```

## Next Steps

- [Unraid Installation Guide](./unraid-guide.md)
- [TrueNAS SCALE Installation Guide](./truenas-guide.md)
- [Agent Installation Guide](./agent-guide.md)
- [Architecture Overview](./architecture.md)
