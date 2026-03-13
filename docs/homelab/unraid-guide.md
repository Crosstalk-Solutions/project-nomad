# Project N.O.M.A.D. — Unraid Installation Guide

## Overview

This guide covers installing Project N.O.M.A.D. Homelab Edition on Unraid using either Docker Compose or the Community Apps template.

## Method 1: Docker Compose (Recommended)

### Prerequisites

- Unraid 6.12+
- Docker enabled in Unraid settings
- Docker Compose plugin installed (available via Community Apps)

### Steps

#### 1. Create the Application Directory

Open an Unraid terminal (or SSH):

```bash
mkdir -p /mnt/user/appdata/project-nomad
cd /mnt/user/appdata/project-nomad
```

#### 2. Download Configuration Files

```bash
# Download docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/DocwatZ/project-nomad-homelab-edition/main/docker-compose.yml -o docker-compose.yml

# Download .env.example
curl -fsSL https://raw.githubusercontent.com/DocwatZ/project-nomad-homelab-edition/main/.env.example -o .env

# Download nginx config
mkdir -p nginx
curl -fsSL https://raw.githubusercontent.com/DocwatZ/project-nomad-homelab-edition/main/nginx/default.conf -o nginx/default.conf

# Download entrypoint
mkdir -p install
curl -fsSL https://raw.githubusercontent.com/DocwatZ/project-nomad-homelab-edition/main/install/entrypoint.sh -o install/entrypoint.sh
chmod +x install/entrypoint.sh
```

#### 3. Configure Environment

```bash
# Generate secrets
APP_KEY=$(openssl rand -hex 32)
DB_PASS=$(openssl rand -base64 24)

# Update .env
sed -i "s/^APP_KEY=replaceme/APP_KEY=$APP_KEY/" .env
sed -i "s/^DB_PASSWORD=replaceme/DB_PASSWORD=$DB_PASS/" .env
sed -i "s/^MYSQL_ROOT_PASSWORD=replaceme/MYSQL_ROOT_PASSWORD=$DB_PASS/" .env

# Set Unraid storage path
sed -i "s|^NOMAD_DATA_DIR=.*|NOMAD_DATA_DIR=/mnt/user/appdata/project-nomad|" .env

# Set your server URL (replace with your Unraid IP)
sed -i "s|^URL=.*|URL=http://$(hostname -I | awk '{print $1}'):8080|" .env
```

#### 4. Create Storage Directories

```bash
mkdir -p /mnt/user/appdata/project-nomad/{storage,redis,logs/nginx}
```

#### 5. Start the Stack

```bash
docker compose up -d
```

#### 6. Access Nomad

Open your browser: `http://YOUR_UNRAID_IP:8080`

### Storage Layout on Unraid

```
/mnt/user/appdata/project-nomad/
├── docker-compose.yml
├── .env
├── nginx/
│   └── default.conf
├── install/
│   └── entrypoint.sh
├── storage/              # Content files (cache-only share recommended)
├── redis/                # Redis data
└── logs/
    └── nginx/            # Nginx logs
```

**Tip:** For large content libraries (ZIM files, maps), consider storing them on a separate Unraid share with cache-preferred settings for better I/O performance.

## Method 2: Community Apps Template

### Steps

1. Install the **Docker Compose Manager** plugin from Community Apps
2. In Unraid web UI, go to **Docker** → **Add Container**
3. Click **Template** and paste the template URL:
   ```
   https://raw.githubusercontent.com/DocwatZ/project-nomad-homelab-edition/main/homelab/unraid-template.xml
   ```
4. Configure the required fields:
   - **APP_KEY**: Generate with `openssl rand -hex 32`
   - **DB_PASSWORD**: Set a secure password
   - **URL**: Your Unraid server URL
5. Click **Apply**

> **Note:** The Community Apps template creates only the Nomad application container. You still need separate MySQL and Redis containers. The Docker Compose method handles all services automatically.

## Unraid-Specific Tips

### Use Cache Drive for Database

For best performance, store the MySQL database on your Unraid cache drive:

```bash
# In .env, the database uses a Docker named volume by default
# This automatically stores on your cache drive
```

### Reverse Proxy with Unraid's SWAG/LSIO

If you use the SWAG (Secure Web Application Gateway) container:

1. Create a proxy config in `/mnt/user/appdata/swag/nginx/proxy-confs/`:

```nginx
# nomad.subdomain.conf
server {
    listen 443 ssl;
    server_name nomad.*;
    include /config/nginx/ssl.conf;

    location / {
        proxy_pass http://nomad-app:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        client_max_body_size 10G;
    }
}
```

2. Ensure SWAG and Nomad share a Docker network.

### Auto-Start on Boot

Docker Compose stacks with `restart: unless-stopped` will automatically restart when Unraid boots and Docker starts.

## Updating on Unraid

```bash
cd /mnt/user/appdata/project-nomad
docker compose pull
docker compose up -d
```

## Troubleshooting

### Permission Issues

Unraid runs containers as root by default. If you encounter permission issues:

```bash
chown -R nobody:users /mnt/user/appdata/project-nomad/storage
chmod -R 755 /mnt/user/appdata/project-nomad/storage
```

### Network Conflicts

If port 8080 conflicts with another container, change the port in `.env`:

```
PORT=8088
```

### Logs

```bash
# View all container logs
docker compose logs -f

# View specific service logs
docker compose logs -f nomad-app
```
