import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveDockerOptions } from '../../app/utils/docker_client.js'

test('resolveDockerOptions defaults to standard unix socket on Linux/macOS', () => {
  assert.deepEqual(resolveDockerOptions({}, 'linux'), { socketPath: '/var/run/docker.sock' })
  assert.deepEqual(resolveDockerOptions({ DOCKER_HOST: '   ' }, 'darwin'), {
    socketPath: '/var/run/docker.sock',
  })
})

test('resolveDockerOptions defaults to Windows named pipe when DOCKER_HOST is unset', () => {
  assert.deepEqual(resolveDockerOptions({}, 'win32'), { socketPath: '//./pipe/docker_engine' })
})

test('resolveDockerOptions parses unix:// DOCKER_HOST', () => {
  assert.deepEqual(
    resolveDockerOptions({ DOCKER_HOST: 'unix:///run/user/1000/docker.sock' }, 'linux'),
    { socketPath: '/run/user/1000/docker.sock' }
  )
  assert.deepEqual(resolveDockerOptions({ DOCKER_HOST: 'unix://' }, 'linux'), {
    socketPath: '/var/run/docker.sock',
  })
})

test('resolveDockerOptions parses npipe:// DOCKER_HOST', () => {
  assert.deepEqual(
    resolveDockerOptions({ DOCKER_HOST: 'npipe:////./pipe/custom_docker' }, 'win32'),
    { socketPath: '//./pipe/custom_docker' }
  )
})

test('resolveDockerOptions parses tcp:// and bare host:port for socket proxies', () => {
  assert.deepEqual(
    resolveDockerOptions({ DOCKER_HOST: 'tcp://docker-socket-proxy:2375' }, 'linux'),
    { host: 'docker-socket-proxy', port: '2375', protocol: 'http' }
  )
  assert.deepEqual(resolveDockerOptions({ DOCKER_HOST: 'docker-socket-proxy:2375' }, 'linux'), {
    host: 'docker-socket-proxy',
    port: '2375',
    protocol: 'http',
  })
})

test('resolveDockerOptions enables https for TLS port 2376, DOCKER_TLS_VERIFY, or https://', () => {
  assert.deepEqual(resolveDockerOptions({ DOCKER_HOST: 'tcp://docker-host:2376' }, 'linux'), {
    host: 'docker-host',
    port: '2376',
    protocol: 'https',
  })
  assert.deepEqual(
    resolveDockerOptions(
      { DOCKER_HOST: 'tcp://docker-host:2375', DOCKER_TLS_VERIFY: '1' },
      'linux'
    ),
    { host: 'docker-host', port: '2375', protocol: 'https' }
  )
  assert.deepEqual(resolveDockerOptions({ DOCKER_HOST: 'https://docker-host:2375' }, 'linux'), {
    host: 'docker-host',
    port: '2375',
    protocol: 'https',
  })
})

test('resolveDockerOptions rejects malformed DOCKER_HOST', () => {
  assert.throws(() => resolveDockerOptions({ DOCKER_HOST: 'tcp://:2375' }, 'linux'))
})
