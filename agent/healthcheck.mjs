#!/usr/bin/env node
// Simple healthcheck for the Nomad agent

const port = process.env.AGENT_PORT || 9100

try {
  const res = await fetch(`http://localhost:${port}/health`)
  if (res.ok) {
    process.exit(0)
  }
  process.exit(1)
} catch {
  process.exit(1)
}
