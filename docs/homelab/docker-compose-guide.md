# Project N.O.M.A.D. — Docker Compose Deployment Guide

## Overview

This guide covers deploying Project N.O.M.A.D. Homelab Edition using Docker Compose on any Linux host, VM, or NAS system.

## Prerequisites

- Docker 20.10+
- Docker Compose v2+ (comes with Docker Desktop or `docker compose` plugin)
- 4 GB RAM minimum
- 5 GB free disk space

### Verify Docker Installation

```bash
docker --version        # Docker 20.10+
docker compose version  # Docker Compose v2+
```

## Deployment

### Step 1: Get the Files

```bash
git clone https://github.com/DocwatZ/project-nomad-homelab-edition.git
cd project-nomad-homelab-edition
```

### Step 2: Configure Environment

```bash
cp .env.example .env
```

Generate secure credentials:

```bash
# Generate application key
APP_KEY=$(openssl rand -hex 32)
sed -i "s/^APP_KEY=replaceme/APP_KEY=$APP_KEY/" .env

# Generate database password
DB_PASS=$(openssl rand -base64 24)
sed -i "s/^DB_PASSWORD=replaceme/DB_PASSWORD=$DB_PASS/" .env
sed -i "s/^MYSQL_ROOT_PASSWORD=replaceme/MYSQL_ROOT_PASSWORD=$DB_PASS/" .env
```

Configure the external URL:

```bash
# Replace with your server IP or domain
sed -i "s|^URL=.*|URL=http://$(hostname -I | awk '{print $1}'):8080|" .env
```

### Step 3: Create Data Directories

```bash
NOMAD_DIR=$(grep NOMAD_DATA_DIR .env | cut -d= -f2)
sudo mkdir -p ${NOMAD_DIR}/{storage,redis,logs/nginx}
sudo chown -R $(id -u):$(id -g) ${NOMAD_DIR}
```

### Step 4: Launch

```bash
docker compose up -d
```

First launch takes 1-3 minutes for database initialization and migrations.

### Step 5: Verify

```bash
# Check all services are running
docker compose ps

# Check application health
curl -s http://localhost:8080/api/health

# View logs
docker compose logs -f nomad-app
```

## Service Management

### Start / Stop / Restart

```bash
# Stop all services
docker compose down

# Start all services
docker compose up -d

# Restart a specific service
docker compose restart nomad-app

# View logs
docker compose logs -f
docker compose logs -f nomad-app
```

### Update to Latest Version

```bash
docker compose pull
docker compose up -d
```

### Full Reset (Destroys Data)

```bash
docker compose down -v
sudo rm -rf /opt/project-nomad/*
docker compose up -d
```

## Customization

### Disable Nginx Proxy

If you already have a reverse proxy (Traefik, Nginx Proxy Manager, Caddy), you can skip the built-in Nginx:

```bash
# Start without nginx
docker compose up -d nomad-app nomad-worker nomad-database nomad-cache
```

Access the app directly on port 8080.

### Disable Worker (Lightweight Mode)

For minimal resource usage, you can run without the dedicated worker. The app will process jobs inline:

```bash
docker compose up -d nomad-app nomad-database nomad-cache
```

> Note: Background downloads and AI features may be slower without the worker.

### Custom Port

Edit `.env`:

```
PORT=9090
```

### Custom Storage Location

Edit `.env`:

```
NOMAD_DATA_DIR=/mnt/my-nas-share/project-nomad
```

## Compose File Structure

The `docker-compose.yml` defines five services:

```
docker-compose.yml
├── nomad-app        # Web application (port 8080)
├── nomad-worker     # Background job processor
├── nomad-database   # MySQL 8.0 database
├── nomad-cache      # Redis 7 cache/queue
└── nomad-nginx      # Nginx reverse proxy (port 80/443)
```

### Override File

Create a `docker-compose.override.yml` for local customizations:

```yaml
services:
  nomad-app:
    # Add extra environment variables
    environment:
      - NOMAD_API_URL=https://api.projectnomad.io
    # Add extra volumes
    volumes:
      - /mnt/nas-share/content:/app/storage/content:ro
```

## Monitoring

### Health Checks

All services include health checks. View status:

```bash
docker compose ps
```

### Resource Usage

```bash
docker stats --no-stream
```

### Prometheus Metrics

Deploy the monitoring agent for Prometheus-compatible metrics:

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

See [Monitoring Architecture](./monitoring.md) for details.

## Troubleshooting

### Service Won't Start

```bash
# Check logs for the failing service
docker compose logs nomad-app
docker compose logs nomad-database

# Check if ports are in use
ss -tlnp | grep -E '(8080|3306|6379|80)'
```

### Database Connection Error

The app waits for the database health check. If it times out:

```bash
# Check database status
docker compose exec nomad-database mysqladmin ping -h localhost

# Check database logs
docker compose logs nomad-database
```

### Permission Denied on Volumes

```bash
sudo chown -R 1000:1000 /opt/project-nomad/storage
```

### Out of Disk Space

```bash
# Check Docker disk usage
docker system df

# Clean up unused images
docker system prune -a
```
