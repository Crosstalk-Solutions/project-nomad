# Nginx Proxy Manager Configuration for Project N.O.M.A.D.

## Prerequisites

- Nginx Proxy Manager installed and running
- Project N.O.M.A.D. stack running (via `docker compose up -d`)
- Both NPM and Nomad on the same Docker network, or using the host IP

## Setup Steps

### 1. Add Proxy Host

1. Open Nginx Proxy Manager web UI (typically `http://your-server:81`)
2. Go to **Proxy Hosts** → **Add Proxy Host**

### 2. Details Tab

| Field | Value |
|-------|-------|
| **Domain Names** | `nomad.home.local` (or your domain) |
| **Scheme** | `http` |
| **Forward Hostname / IP** | `nomad-app` (if on same Docker network) or your host IP |
| **Forward Port** | `8080` |
| **Cache Assets** | Enabled |
| **Block Common Exploits** | Enabled |
| **Websockets Support** | **Enabled** (required for real-time updates) |

### 3. SSL Tab (Optional)

| Field | Value |
|-------|-------|
| **SSL Certificate** | Request a new certificate or select existing |
| **Force SSL** | Enabled |
| **HTTP/2 Support** | Enabled |

### 4. Advanced Tab

Add the following custom Nginx configuration:

```nginx
# Large file upload support (10GB)
client_max_body_size 10G;

# Timeout settings for large operations
proxy_read_timeout 600s;
proxy_send_timeout 600s;
proxy_connect_timeout 60s;

# Forward real IP headers
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
```

### 5. Docker Network Configuration

If Nginx Proxy Manager runs in Docker, ensure it can reach the Nomad containers.

**Option A: Same Docker network**

Add NPM to the `nomad-internal` network in your NPM docker-compose:

```yaml
services:
  npm:
    # ... existing config ...
    networks:
      - nomad-internal

networks:
  nomad-internal:
    external: true
```

**Option B: Host networking**

Use your server's IP address instead of container names:

- Forward Hostname: `192.168.1.100` (your server IP)
- Forward Port: `8080`

## Verification

After setup, visit your configured domain. You should see the Nomad dashboard.

Check the health endpoint: `https://nomad.home.local/api/health`
