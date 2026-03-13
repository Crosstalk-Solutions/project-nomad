# Project N.O.M.A.D. — Agent Installation Guide

## Overview

The Nomad monitoring agent is a lightweight container that collects system metrics from remote homelab nodes and reports them to the Nomad server. It exposes a Prometheus-compatible `/metrics` endpoint.

## Features

- **System metrics**: CPU usage, memory, disk, network
- **Docker monitoring**: Container status, running/stopped counts
- **Prometheus endpoint**: Native `/metrics` output for scraping
- **Low resource usage**: ~20MB RAM, minimal CPU
- **Auto-reporting**: Sends metrics to Nomad server on configurable interval

## Quick Start

### Docker (Recommended)

```bash
docker run -d \
  --name nomad-agent \
  --restart unless-stopped \
  -p 9100:9100 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  -e NOMAD_SERVER_URL=http://your-nomad-server:8080 \
  -e AGENT_SECRET=your-shared-secret \
  -e NODE_NAME=my-server \
  ghcr.io/docwatz/nomad-agent:latest
```

### Docker Compose

Add to your existing `docker-compose.yml` or create a new one:

```yaml
services:
  nomad-agent:
    build: ./agent
    container_name: nomad-agent
    restart: unless-stopped
    ports:
      - "9100:9100"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
    environment:
      - NOMAD_SERVER_URL=http://your-nomad-server:8080
      - AGENT_SECRET=your-shared-secret
      - NODE_NAME=my-server
      - COLLECT_INTERVAL=30
```

### Build from Source

```bash
cd agent/
docker build -t nomad-agent .
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_PORT` | 9100 | Metrics server port |
| `COLLECT_INTERVAL` | 30 | Collection interval in seconds |
| `NOMAD_SERVER_URL` | — | Nomad server URL for reporting |
| `AGENT_SECRET` | — | Shared secret for authentication |
| `NODE_NAME` | hostname | Display name for this node |
| `HOST_PROC` | /host/proc | Path to host /proc mount |
| `HOST_SYS` | /host/sys | Path to host /sys mount |

## API Endpoints

| Endpoint | Format | Description |
|----------|--------|-------------|
| `GET /health` | JSON | Health check |
| `GET /metrics` | Prometheus | Prometheus exposition format |
| `GET /api/metrics` | JSON | Full metrics as JSON |

## Prometheus Integration

Add the agent as a scrape target in your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'nomad-agent'
    static_configs:
      - targets:
          - 'server1:9100'
          - 'server2:9100'
          - 'nas:9100'
    scrape_interval: 30s
```

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `nomad_agent_cpu_usage_percent` | gauge | CPU usage percentage |
| `nomad_agent_cpu_count` | gauge | Number of CPU cores |
| `nomad_agent_memory_total_bytes` | gauge | Total memory |
| `nomad_agent_memory_used_bytes` | gauge | Used memory |
| `nomad_agent_memory_usage_percent` | gauge | Memory usage percentage |
| `nomad_agent_uptime_seconds` | gauge | System uptime |
| `nomad_agent_docker_containers` | gauge | Total Docker containers |
| `nomad_agent_docker_container_running` | gauge | Per-container running status |

## Security

- The agent runs as a non-root user inside the container
- Docker socket is mounted read-only
- Communication with the Nomad server uses a shared secret via `Authorization: Bearer` header
- For production use, place behind a TLS-terminating reverse proxy

## Resource Usage

| Metric | Value |
|--------|-------|
| RAM | ~15-25 MB |
| CPU | < 1% (idle) |
| Image size | ~60 MB |
| Network | ~1 KB per report |

## Deploying on Multiple Nodes

Deploy an agent on each homelab node:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Server 1   │     │  Server 2   │     │    NAS      │
│ nomad-agent │     │ nomad-agent │     │ nomad-agent │
│  :9100      │     │  :9100      │     │  :9100      │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │ Nomad Server│
                    │  :8080      │
                    └─────────────┘
```

Each agent auto-registers with the Nomad server using `NODE_NAME` and begins sending telemetry at the configured interval.
