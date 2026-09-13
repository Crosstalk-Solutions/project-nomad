import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  OPENHOP_REPEATER_IMAGE,
  buildOpenHopRepeaterContainerConfig,
} from '../../constants/openhop_repeater.js'

test('openHop Repeater uses the approved stable plugin-enabled image', () => {
  assert.equal(OPENHOP_REPEATER_IMAGE, 'openhop/openhop-repeater:v1.1.4')
})

test('openHop Repeater container config persists data and exposes only serial USB device classes', () => {
  const config = buildOpenHopRepeaterContainerConfig('/srv/nomad')

  assert.deepEqual(config.HostConfig.PortBindings, {
    '8000/tcp': [{ HostPort: '8510' }],
  })
  assert.deepEqual(config.ExposedPorts, { '8000/tcp': {} })
  assert.deepEqual(config.HostConfig.Binds, [
    '/srv/nomad/openhop-repeater/config:/etc/openhop_repeater',
    '/srv/nomad/openhop-repeater/data:/var/lib/openhop_repeater',
    '/dev:/host/dev',
  ])
  assert.deepEqual(config.HostConfig.DeviceCgroupRules, ['c 166:* rwm', 'c 188:* rwm'])
  assert.deepEqual(config.HostConfig.RestartPolicy, { Name: 'unless-stopped' })
  assert.equal('Privileged' in config.HostConfig, false)
  assert.equal('Devices' in config.HostConfig, false)
  assert.equal('CapAdd' in config.HostConfig, false)
  assert.equal('User' in config, false)
})
