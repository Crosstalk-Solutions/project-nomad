# Project N.O.M.A.D. — Monitoring Architecture

## Overview

The Nomad Homelab Edition includes built-in monitoring capabilities and integrates with standard homelab monitoring stacks.

## Monitoring Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     Nomad Dashboard                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ NAS      │ │ Server   │ │Container │ │ Network  │      │
│  │ Health   │ │ Metrics  │ │ Status   │ │ Devices  │      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘      │
│       │            │            │            │              │
│  ┌────▼────────────▼────────────▼────────────▼─────┐       │
│  │              Nomad App (Aggregator)              │       │
│  └──────────────────────┬──────────────────────────┘       │
└─────────────────────────┼──────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐   ┌────▼────┐   ┌──────▼──────┐
    │  Agent 1  │   │ Agent 2 │   │   Agent N   │
    │ (Server)  │   │ (NAS)   │   │  (Remote)   │
    │  :9100    │   │ :9100   │   │   :9100     │
    └───────────┘   └─────────┘   └─────────────┘
```

## Built-in Monitoring

### System Resource Monitoring

The Nomad application provides built-in system information through the system controller:

- **CPU**: Model, core count, usage
- **Memory**: Total, used, free, usage percentage
- **Disk**: Mount points, usage, filesystem types
- **Docker**: Container status, image versions, resource usage

### Docker Container Monitoring

Nomad monitors its own container stack and any Docker containers on the host via the Docker socket:

- Container health status
- Image versions and update availability
- Resource consumption
- Log access (via Dozzle integration in original install)

### Health Endpoints

| Endpoint | Service | Purpose |
|----------|---------|---------|
| `GET /api/health` | nomad-app | Application health |
| `GET /nginx-health` | nomad-nginx | Reverse proxy health |
| `GET /health` | nomad-agent | Agent health |

## Agent-Based Monitoring

### Architecture

The Nomad monitoring agent runs on remote homelab nodes and reports metrics via:

1. **Push model**: Agent sends JSON metrics to `POST /api/agent/report` on the Nomad server
2. **Pull model**: Prometheus scrapes the agent's `/metrics` endpoint

### Agent Metrics

```
nomad_agent_cpu_usage_percent      - CPU utilization
nomad_agent_cpu_count              - CPU core count
nomad_agent_memory_total_bytes     - Total RAM
nomad_agent_memory_used_bytes      - Used RAM
nomad_agent_memory_usage_percent   - RAM utilization
nomad_agent_uptime_seconds         - System uptime
nomad_agent_docker_containers      - Docker container count
nomad_agent_docker_container_running - Per-container status
```

### Deployment

Deploy an agent on each node you want to monitor:

```bash
docker run -d --name nomad-agent \
  --restart unless-stopped \
  -p 9100:9100 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  -e NOMAD_SERVER_URL=http://nomad-server:8080 \
  -e NODE_NAME=$(hostname) \
  nomad-agent
```

## Prometheus Integration

### Full Monitoring Stack

For a complete monitoring setup, add Prometheus and Grafana to your docker-compose:

```yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: nomad-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    networks:
      - nomad-internal

  grafana:
    image: grafana/grafana:latest
    container_name: nomad-grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    networks:
      - nomad-internal

volumes:
  prometheus-data:
  grafana-data:
```

### Prometheus Configuration

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  - job_name: 'nomad-agents'
    static_configs:
      - targets:
          - 'nomad-agent:9100'      # Local agent
          - 'server2:9100'           # Remote server
          - 'nas:9100'               # NAS agent
```

### Node Exporter (Optional)

For deeper host-level metrics, add the Prometheus Node Exporter alongside the Nomad agent:

```yaml
node-exporter:
  image: prom/node-exporter:latest
  container_name: nomad-node-exporter
  restart: unless-stopped
  ports:
    - "9101:9100"
  volumes:
    - /proc:/host/proc:ro
    - /sys:/host/sys:ro
    - /:/rootfs:ro
  command:
    - '--path.procfs=/host/proc'
    - '--path.sysfs=/host/sys'
    - '--path.rootfs=/rootfs'
    - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
```

## Observability

### Structured Logging

The Nomad application uses structured JSON logging:

```json
{
  "level": "info",
  "timestamp": "2026-03-13T12:00:00.000Z",
  "msg": "HTTP request completed",
  "method": "GET",
  "url": "/api/health",
  "status": 200,
  "duration": "12ms"
}
```

Configure log level via `LOG_LEVEL` environment variable: `debug`, `info`, `warn`, `error`.

### Log Access

```bash
# Application logs
docker compose logs -f nomad-app

# Worker logs
docker compose logs -f nomad-worker

# All service logs
docker compose logs -f

# Nginx access logs (on host)
tail -f ${NOMAD_DATA_DIR}/logs/nginx/access.log
```

### Alerting Recommendations

For homelab alerting, integrate with:

| Tool | Use Case |
|------|----------|
| **Uptime Kuma** | Service uptime monitoring |
| **Grafana Alerting** | Metric-based alerts |
| **Ntfy** | Push notifications |
| **Gotify** | Self-hosted notifications |

Example Uptime Kuma monitor:
- **URL**: `http://nomad-app:8080/api/health`
- **Interval**: 60 seconds
- **Expected status**: 200
