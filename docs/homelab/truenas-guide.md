# Project N.O.M.A.D. — TrueNAS SCALE Installation Guide

## Overview

TrueNAS SCALE supports both Docker Compose (via custom app) and Helm charts for application deployment. This guide covers both methods.

## Method 1: Docker Compose via Custom App (Recommended)

TrueNAS SCALE Electric Eel (24.10+) supports Docker Compose as a custom app deployment method.

### Prerequisites

- TrueNAS SCALE 24.10+ (Electric Eel or newer)
- A dataset for application data

### Steps

#### 1. Create a Dataset

1. Go to **Storage** → **Pools**
2. Create a new dataset: `project-nomad`
   - Path: `/mnt/pool/apps/project-nomad`
   - Record Size: 128K
   - Compression: LZ4

#### 2. Create Subdirectories

Open a TrueNAS shell:

```bash
mkdir -p /mnt/pool/apps/project-nomad/{storage,redis,logs/nginx,config}
```

#### 3. Deploy as Custom App

1. Go to **Apps** → **Discover Apps** → **Custom App**
2. Upload or paste the `docker-compose.yml` from this repository
3. Configure environment variables:
   - `APP_KEY`: Generate with `openssl rand -hex 32`
   - `DB_PASSWORD`: Set a secure password
   - `MYSQL_ROOT_PASSWORD`: Same as DB_PASSWORD
   - `URL`: `http://YOUR_TRUENAS_IP:8080`
   - `NOMAD_DATA_DIR`: `/mnt/pool/apps/project-nomad`

#### 4. Start the Application

Click **Deploy** and wait for all services to start (first launch may take 2-3 minutes).

## Method 2: Helm Chart

### Prerequisites

- TrueNAS SCALE with Kubernetes enabled
- Helm CLI (if deploying manually)

### Steps

#### 1. Add the Chart

```bash
# Clone the repository
git clone https://github.com/DocwatZ/project-nomad-homelab-edition.git
cd project-nomad-homelab-edition/homelab/truenas

# Install with Helm
helm install project-nomad . \
  --set app.appKey=$(openssl rand -hex 32) \
  --set database.password=$(openssl rand -base64 24) \
  --set database.rootPassword=$(openssl rand -base64 24) \
  --set app.url=http://YOUR_TRUENAS_IP:8080 \
  --set storage.data.hostPath=/mnt/pool/apps/project-nomad/storage
```

#### 2. Verify Deployment

```bash
helm status project-nomad
kubectl get pods -l app.kubernetes.io/instance=project-nomad
```

## TrueNAS-Specific Configuration

### Storage Best Practices

**ZFS Dataset Recommendations:**

| Dataset | Record Size | Compression | Purpose |
|---------|-------------|-------------|---------|
| `project-nomad/storage` | 1M | LZ4 | Large content files |
| `project-nomad/database` | 16K | LZ4 | MySQL data (if not using Docker volume) |
| `project-nomad/redis` | 128K | LZ4 | Redis persistence |

**Performance Tip:** Use a Docker named volume for the MySQL database (default in docker-compose.yml). Docker volumes on TrueNAS use the app pool, which typically has better I/O than network-accessed datasets.

### Network Configuration

TrueNAS SCALE apps run in an isolated network by default. To access Nomad from your LAN:

1. The compose file maps port 8080 to the host
2. Access via `http://YOUR_TRUENAS_IP:8080`

If using the Nginx proxy (port 80):
- Ensure port 80 isn't used by TrueNAS web UI
- Change `NGINX_HTTP_PORT` in `.env` if needed

### Permissions

TrueNAS uses ACLs for dataset permissions. Set the dataset owner:

```bash
# For Docker Compose deployments
chown -R 1000:1000 /mnt/pool/apps/project-nomad/storage
```

Or configure ACLs in the TrueNAS UI:
1. Go to **Storage** → select your dataset → **Edit Permissions**
2. Set User: `1000`, Group: `1000`
3. Apply recursively

## Updating on TrueNAS

### Docker Compose Method

```bash
cd /mnt/pool/apps/project-nomad
docker compose pull
docker compose up -d
```

### Helm Method

```bash
helm upgrade project-nomad ./homelab/truenas \
  --reuse-values
```

## Monitoring on TrueNAS

TrueNAS SCALE includes built-in reporting. You can supplement it with the Nomad monitoring agent:

```bash
docker run -d --name nomad-agent \
  --restart unless-stopped \
  -p 9100:9100 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  -e NOMAD_SERVER_URL=http://nomad-app:8080 \
  -e NODE_NAME=truenas \
  nomad-agent
```

## Troubleshooting

### App Won't Start

```bash
# Check container status
docker compose ps

# View logs
docker compose logs nomad-app
docker compose logs nomad-database
```

### Database Issues

If the database fails to initialize:

```bash
# Check MySQL logs
docker compose logs nomad-database

# Verify the database volume
docker volume inspect project-nomad_nomad-db-data
```

### Port Conflicts

TrueNAS web UI uses ports 80/443 by default. Adjust in `.env`:

```
NGINX_HTTP_PORT=8081
NGINX_HTTPS_PORT=8443
```
