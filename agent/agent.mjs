#!/usr/bin/env node
// =============================================================================
// PROJECT N.O.M.A.D. — Homelab Edition
// Lightweight Monitoring Agent
// =============================================================================
// Collects system metrics and reports them to the Nomad server.
// Designed for minimal CPU and RAM usage on homelab nodes.
// =============================================================================

import { createServer } from 'node:http'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { hostname, cpus, totalmem, freemem, uptime, networkInterfaces, platform, arch, release } from 'node:os'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const config = {
  port: parseInt(process.env.AGENT_PORT || '9100', 10),
  collectInterval: parseInt(process.env.COLLECT_INTERVAL || '30', 10) * 1000,
  serverUrl: process.env.NOMAD_SERVER_URL || '',
  agentSecret: process.env.AGENT_SECRET || '',
  nodeName: process.env.NODE_NAME || hostname(),
  hostProcPath: process.env.HOST_PROC || '/host/proc',
  hostSysPath: process.env.HOST_SYS || '/host/sys',
}

// ---------------------------------------------------------------------------
// Metrics Collection
// ---------------------------------------------------------------------------

/** Collect CPU usage from /proc/stat or os module */
function collectCpuMetrics() {
  const cpuList = cpus()
  const cpuCount = cpuList.length
  let totalIdle = 0
  let totalTick = 0

  for (const cpu of cpuList) {
    const { user, nice, sys, idle, irq } = cpu.times
    totalTick += user + nice + sys + idle + irq
    totalIdle += idle
  }

  return {
    count: cpuCount,
    model: cpuList[0]?.model || 'unknown',
    usagePercent: cpuCount > 0 ? Math.round((1 - totalIdle / totalTick) * 100 * 100) / 100 : 0,
  }
}

/** Collect memory metrics */
function collectMemoryMetrics() {
  const total = totalmem()
  const free = freemem()
  const used = total - free

  return {
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    usagePercent: Math.round((used / total) * 100 * 100) / 100,
  }
}

/** Collect disk usage from /proc/mounts and /proc/diskstats */
function collectDiskMetrics() {
  const disks = []

  try {
    const mountsPath = `${config.hostProcPath}/mounts`
    if (existsSync(mountsPath)) {
      const mounts = readFileSync(mountsPath, 'utf-8')
      const lines = mounts.split('\n').filter((l) => l.startsWith('/dev/'))

      for (const line of lines) {
        const parts = line.split(/\s+/)
        if (parts.length >= 4) {
          disks.push({
            device: parts[0],
            mountPoint: parts[1],
            fsType: parts[2],
          })
        }
      }
    }
  } catch {
    // Disk metrics may not be available in all environments
  }

  return disks
}

/** Collect network interface information */
function collectNetworkMetrics() {
  const interfaces = networkInterfaces()
  const nets = []

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        nets.push({
          interface: name,
          address: addr.address,
          mac: addr.mac,
        })
      }
    }
  }

  return nets
}

/** Collect Docker container status via Docker socket using Node.js http module */
async function collectDockerMetrics() {
  const containers = []

  try {
    const socketPath = '/var/run/docker.sock'
    if (!existsSync(socketPath)) return containers

    // Use Node.js http module for Unix socket support (fetch API does not support socketPath)
    const { request } = await import('node:http')
    const data = await new Promise((resolve, reject) => {
      const req = request({ socketPath, path: '/containers/json?all=true', method: 'GET' }, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(body)) } catch { resolve([]) }
        })
      })
      req.on('error', () => resolve([]))
      req.setTimeout(5000, () => { req.destroy(); resolve([]) })
      req.end()
    })

    for (const container of data) {
      containers.push({
        id: container.Id?.substring(0, 12),
        name: container.Names?.[0]?.replace(/^\//, ''),
        image: container.Image,
        state: container.State,
        status: container.Status,
      })
    }
  } catch {
    // Docker metrics may not be available
  }

  return containers
}

/** Collect all metrics */
async function collectAllMetrics() {
  const [dockerContainers] = await Promise.all([collectDockerMetrics()])

  return {
    timestamp: new Date().toISOString(),
    node: {
      name: config.nodeName,
      platform: platform(),
      arch: arch(),
      release: release(),
      uptime: Math.floor(uptime()),
    },
    cpu: collectCpuMetrics(),
    memory: collectMemoryMetrics(),
    disks: collectDiskMetrics(),
    network: collectNetworkMetrics(),
    docker: {
      containers: dockerContainers,
      containerCount: dockerContainers.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Metrics Reporting
// ---------------------------------------------------------------------------

/** Send metrics to Nomad server */
async function reportMetrics(metrics) {
  if (!config.serverUrl) return

  try {
    const url = `${config.serverUrl}/api/agent/report`
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.agentSecret}`,
      },
      body: JSON.stringify(metrics),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    // Silently retry on next interval
  }
}

// ---------------------------------------------------------------------------
// Prometheus Metrics Endpoint
// ---------------------------------------------------------------------------

/** Format metrics as Prometheus exposition format */
function formatPrometheusMetrics(metrics) {
  const lines = []

  // CPU metrics
  lines.push('# HELP nomad_agent_cpu_usage_percent CPU usage percentage')
  lines.push('# TYPE nomad_agent_cpu_usage_percent gauge')
  lines.push(`nomad_agent_cpu_usage_percent{node="${metrics.node.name}"} ${metrics.cpu.usagePercent}`)

  lines.push('# HELP nomad_agent_cpu_count Number of CPU cores')
  lines.push('# TYPE nomad_agent_cpu_count gauge')
  lines.push(`nomad_agent_cpu_count{node="${metrics.node.name}"} ${metrics.cpu.count}`)

  // Memory metrics
  lines.push('# HELP nomad_agent_memory_total_bytes Total memory in bytes')
  lines.push('# TYPE nomad_agent_memory_total_bytes gauge')
  lines.push(`nomad_agent_memory_total_bytes{node="${metrics.node.name}"} ${metrics.memory.totalBytes}`)

  lines.push('# HELP nomad_agent_memory_used_bytes Used memory in bytes')
  lines.push('# TYPE nomad_agent_memory_used_bytes gauge')
  lines.push(`nomad_agent_memory_used_bytes{node="${metrics.node.name}"} ${metrics.memory.usedBytes}`)

  lines.push('# HELP nomad_agent_memory_usage_percent Memory usage percentage')
  lines.push('# TYPE nomad_agent_memory_usage_percent gauge')
  lines.push(`nomad_agent_memory_usage_percent{node="${metrics.node.name}"} ${metrics.memory.usagePercent}`)

  // Uptime
  lines.push('# HELP nomad_agent_uptime_seconds System uptime in seconds')
  lines.push('# TYPE nomad_agent_uptime_seconds gauge')
  lines.push(`nomad_agent_uptime_seconds{node="${metrics.node.name}"} ${metrics.node.uptime}`)

  // Docker containers
  lines.push('# HELP nomad_agent_docker_containers Number of Docker containers')
  lines.push('# TYPE nomad_agent_docker_containers gauge')
  lines.push(`nomad_agent_docker_containers{node="${metrics.node.name}"} ${metrics.docker.containerCount}`)

  for (const container of metrics.docker.containers) {
    const running = container.state === 'running' ? 1 : 0
    lines.push(`nomad_agent_docker_container_running{node="${metrics.node.name}",name="${container.name}",image="${container.image}"} ${running}`)
  }

  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

let latestMetrics = null

const server = createServer(async (req, res) => {
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'healthy', node: config.nodeName }))
    return
  }

  if (req.url === '/metrics') {
    const metrics = latestMetrics || (await collectAllMetrics())
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' })
    res.end(formatPrometheusMetrics(metrics))
    return
  }

  if (req.url === '/api/metrics') {
    const metrics = latestMetrics || (await collectAllMetrics())
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(metrics))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

// ---------------------------------------------------------------------------
// Main Loop
// ---------------------------------------------------------------------------

async function collectAndReport() {
  try {
    latestMetrics = await collectAllMetrics()
    await reportMetrics(latestMetrics)
  } catch (err) {
    console.error('Collection error:', err.message)
  }
}

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[nomad-agent] Node: ${config.nodeName}`)
  console.log(`[nomad-agent] Metrics server listening on port ${config.port}`)
  console.log(`[nomad-agent] Collection interval: ${config.collectInterval / 1000}s`)
  if (config.serverUrl) {
    console.log(`[nomad-agent] Reporting to: ${config.serverUrl}`)
  } else {
    console.log('[nomad-agent] No NOMAD_SERVER_URL set — metrics available via /metrics endpoint only')
  }

  // Initial collection
  collectAndReport()

  // Periodic collection
  setInterval(collectAndReport, config.collectInterval)
})
