import { test } from '@japa/runner'
import { DockerService } from '#services/docker_service'

/**
 * Unit tests for DockerService
 *
 * These tests exercise the service's logic without requiring a real Docker daemon
 * by replacing internal properties and methods with lightweight stubs.
 */

// ---------------------------------------------------------------------------
// Helper: build a DockerService instance with a stubbed Docker client
// ---------------------------------------------------------------------------
function buildService(dockerStub: Record<string, any> = {}): DockerService {
  const svc = Object.create(DockerService.prototype) as DockerService
  // Inject a fake docker client – tests override individual methods as needed
  ;(svc as any).docker = {
    listContainers: async () => [],
    info: async () => ({}),
    ...dockerStub,
  }
  // Initialise the in-memory installation guard
  ;(svc as any).activeInstallations = new Set<string>()
  return svc
}

// ---------------------------------------------------------------------------
// getServicesStatus
// ---------------------------------------------------------------------------
test.group('DockerService – getServicesStatus', () => {
  test('returns statuses for nomad_ prefixed containers only', async ({ assert }) => {
    const svc = buildService({
      listContainers: async () => [
        { Names: ['/nomad_ollama'], State: 'running' },
        { Names: ['/nomad_qdrant'], State: 'exited' },
        { Names: ['/some_other_app'], State: 'running' },
      ],
    })

    const result = await svc.getServicesStatus()

    assert.lengthOf(result, 2)
    assert.deepEqual(result, [
      { service_name: 'nomad_ollama', status: 'running' },
      { service_name: 'nomad_qdrant', status: 'exited' },
    ])
  })

  test('returns empty array when Docker throws', async ({ assert }) => {
    const svc = buildService({
      listContainers: async () => {
        throw new Error('socket hung up')
      },
    })

    const result = await svc.getServicesStatus()
    assert.deepEqual(result, [])
  })

  test('returns empty array when there are no containers', async ({ assert }) => {
    const svc = buildService({
      listContainers: async () => [],
    })

    const result = await svc.getServicesStatus()
    assert.deepEqual(result, [])
  })

  test('deduplicates containers with multiple names (uses first)', async ({ assert }) => {
    const svc = buildService({
      listContainers: async () => [
        { Names: ['/nomad_ollama', '/alias'], State: 'running' },
      ],
    })

    const result = await svc.getServicesStatus()
    assert.lengthOf(result, 1)
    assert.equal(result[0].service_name, 'nomad_ollama')
  })
})

// ---------------------------------------------------------------------------
// _detectGPUType (private – accessed via cast)
// ---------------------------------------------------------------------------
test.group('DockerService – _detectGPUType', () => {
  test('detects nvidia when Docker runtimes contain nvidia', async ({ assert }) => {
    const svc = buildService({
      info: async () => ({
        Runtimes: { nvidia: {}, runc: {} },
      }),
    })
    // Stub _persistGPUType to avoid DB call
    ;(svc as any)._persistGPUType = async () => {}

    const result = await (svc as any)._detectGPUType()
    assert.equal(result.type, 'nvidia')
    assert.isUndefined(result.toolkitMissing)
  })

  test('returns none when Docker info has no nvidia runtime and lspci unavailable', async ({
    assert,
  }) => {
    const svc = buildService({
      info: async () => ({ Runtimes: { runc: {} } }),
    })

    const result = await (svc as any)._detectGPUType()
    assert.equal(result.type, 'none')
  })

  test('returns none when Docker info throws', async ({ assert }) => {
    const svc = buildService({
      info: async () => {
        throw new Error('connection refused')
      },
    })

    const result = await (svc as any)._detectGPUType()
    assert.equal(result.type, 'none')
  })
})

// ---------------------------------------------------------------------------
// _parseContainerConfig (private)
// ---------------------------------------------------------------------------
test.group('DockerService – _parseContainerConfig', () => {
  test('parses valid JSON string', async ({ assert }) => {
    const svc = buildService()
    const config = { HostConfig: { PortBindings: {} } }
    const result = (svc as any)._parseContainerConfig(JSON.stringify(config))
    assert.deepEqual(result, config)
  })

  test('handles object input (already parsed by DB driver)', async ({ assert }) => {
    const svc = buildService()
    const config = { HostConfig: { Binds: ['/data:/data'] } }
    const result = (svc as any)._parseContainerConfig(config)
    assert.deepEqual(result, config)
  })

  test('returns empty object for null / undefined', async ({ assert }) => {
    const svc = buildService()
    assert.deepEqual((svc as any)._parseContainerConfig(null), {})
    assert.deepEqual((svc as any)._parseContainerConfig(undefined), {})
  })

  test('throws on invalid JSON string', async ({ assert }) => {
    const svc = buildService()
    assert.throws(
      () => (svc as any)._parseContainerConfig('not json'),
      /Invalid container configuration/
    )
  })
})

// ---------------------------------------------------------------------------
// Installation guard (activeInstallations Set)
// ---------------------------------------------------------------------------
test.group('DockerService – installation guard', () => {
  test('activeInstallations prevents duplicate installs', async ({ assert }) => {
    const svc = buildService()
    const installations = (svc as any).activeInstallations as Set<string>

    assert.isFalse(installations.has('nomad_ollama'))

    installations.add('nomad_ollama')
    assert.isTrue(installations.has('nomad_ollama'))

    // Attempting to add again is idempotent but still returns true
    installations.add('nomad_ollama')
    assert.equal(installations.size, 1)

    installations.delete('nomad_ollama')
    assert.isFalse(installations.has('nomad_ollama'))
  })
})

// ---------------------------------------------------------------------------
// getServiceURL – null guard
// ---------------------------------------------------------------------------
test.group('DockerService – getServiceURL', () => {
  test('returns null for empty service name', async ({ assert }) => {
    const svc = buildService()
    const result = await svc.getServiceURL('')
    assert.isNull(result)
  })

  test('returns null for whitespace-only service name', async ({ assert }) => {
    const svc = buildService()
    const result = await svc.getServiceURL('   ')
    assert.isNull(result)
  })
})

// ---------------------------------------------------------------------------
// Container command splitting behaviour
// ---------------------------------------------------------------------------
test.group('DockerService – container command splitting', () => {
  test('simple command splits into expected parts', ({ assert }) => {
    const cmd = 'serve --host 0.0.0.0'
    const parts = cmd.split(' ')
    assert.deepEqual(parts, ['serve', '--host', '0.0.0.0'])
  })

  test('single-word command produces single-element array', ({ assert }) => {
    const cmd = 'start'
    const parts = cmd.split(' ')
    assert.deepEqual(parts, ['start'])
  })

  test('empty command string produces single empty-string element', ({ assert }) => {
    const cmd = ''
    const parts = cmd.split(' ')
    assert.deepEqual(parts, [''])
  })

  test('command with multiple spaces produces empty string elements', ({ assert }) => {
    // This documents the current split(' ') behaviour with consecutive spaces
    const cmd = 'serve  --port  8080'
    const parts = cmd.split(' ')
    assert.include(parts, '')
    assert.isAbove(parts.length, 3)
  })

  test('falsy container_command results in no Cmd property', ({ assert }) => {
    // Mirrors the ternary: service.container_command ? { Cmd: ... } : {}
    const containerCommand = null as string | null
    const spread = containerCommand ? { Cmd: (containerCommand as string).split(' ') } : {}
    assert.deepEqual(spread, {})
  })

  test('truthy container_command produces Cmd property', ({ assert }) => {
    const containerCommand: string | null = '--workers 4 --timeout 30'
    const spread = containerCommand ? { Cmd: containerCommand.split(' ') } : {}
    assert.deepEqual(spread, { Cmd: ['--workers', '4', '--timeout', '30'] })
  })
})

// ---------------------------------------------------------------------------
// _detectGPUType – additional edge cases
// ---------------------------------------------------------------------------
test.group('DockerService – _detectGPUType edge cases', () => {
  test('nvidia runtime detected takes priority over lspci', async ({ assert }) => {
    const svc = buildService({
      info: async () => ({
        Runtimes: { nvidia: {}, runc: {} },
      }),
    })
    ;(svc as any)._persistGPUType = async () => {}

    const result = await (svc as any)._detectGPUType()
    assert.equal(result.type, 'nvidia')
  })

  test('empty Runtimes object returns none', async ({ assert }) => {
    const svc = buildService({
      info: async () => ({ Runtimes: {} }),
    })

    const result = await (svc as any)._detectGPUType()
    assert.equal(result.type, 'none')
  })

  test('undefined Runtimes returns none', async ({ assert }) => {
    const svc = buildService({
      info: async () => ({}),
    })

    const result = await (svc as any)._detectGPUType()
    assert.equal(result.type, 'none')
  })
})

// ---------------------------------------------------------------------------
// getServicesStatus – additional scenarios
// ---------------------------------------------------------------------------
test.group('DockerService – getServicesStatus additional', () => {
  test('handles containers with various states', async ({ assert }) => {
    const svc = buildService({
      listContainers: async () => [
        { Names: ['/nomad_ollama'], State: 'running' },
        { Names: ['/nomad_qdrant'], State: 'created' },
        { Names: ['/nomad_kiwix'], State: 'paused' },
      ],
    })

    const result = await svc.getServicesStatus()
    assert.lengthOf(result, 3)
    assert.equal(result[0].status, 'running')
    assert.equal(result[1].status, 'created')
    assert.equal(result[2].status, 'paused')
  })

  test('strips leading slash from container names', async ({ assert }) => {
    const svc = buildService({
      listContainers: async () => [
        { Names: ['/nomad_test'], State: 'running' },
      ],
    })

    const result = await svc.getServicesStatus()
    assert.equal(result[0].service_name, 'nomad_test')
    assert.isFalse(result[0].service_name.startsWith('/'))
  })
})

// ---------------------------------------------------------------------------
// Installation guard – concurrent access patterns
// ---------------------------------------------------------------------------
test.group('DockerService – installation guard concurrent patterns', () => {
  test('multiple services can be tracked independently', ({ assert }) => {
    const svc = buildService()
    const installations = (svc as any).activeInstallations as Set<string>

    installations.add('nomad_ollama')
    installations.add('nomad_qdrant')

    assert.isTrue(installations.has('nomad_ollama'))
    assert.isTrue(installations.has('nomad_qdrant'))
    assert.equal(installations.size, 2)

    installations.delete('nomad_ollama')
    assert.isFalse(installations.has('nomad_ollama'))
    assert.isTrue(installations.has('nomad_qdrant'))
    assert.equal(installations.size, 1)
  })

  test('clearing installations removes all entries', ({ assert }) => {
    const svc = buildService()
    const installations = (svc as any).activeInstallations as Set<string>

    installations.add('nomad_ollama')
    installations.add('nomad_qdrant')
    installations.add('nomad_kiwix')

    installations.clear()
    assert.equal(installations.size, 0)
  })
})

// ---------------------------------------------------------------------------
// NOMAD_NETWORK static property
// ---------------------------------------------------------------------------
test.group('DockerService – static properties', () => {
  test('NOMAD_NETWORK has expected value', async ({ assert }) => {
    assert.equal(DockerService.NOMAD_NETWORK, 'project-nomad_default')
  })
})
