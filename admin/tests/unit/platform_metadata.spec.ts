import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeArchitecture, deriveOsName } from '../../app/utils/platform_metadata.js'

// Values observed from `docker info` across the test fleet (NOMAD3 x86 / 26.04,
// NOMAD6 x86 / 24.04, nomad10 Raspberry Pi 5 arm64 / 26.04).

test('normalizeArchitecture maps Docker arch strings to OCI platform names', () => {
  assert.equal(normalizeArchitecture('x86_64'), 'amd64')
  assert.equal(normalizeArchitecture('aarch64'), 'arm64')
})

test('normalizeArchitecture accepts values already in OCI form', () => {
  assert.equal(normalizeArchitecture('amd64'), 'amd64')
  assert.equal(normalizeArchitecture('arm64'), 'arm64')
})

test('normalizeArchitecture is case- and whitespace-insensitive', () => {
  assert.equal(normalizeArchitecture('  X86_64 '), 'amd64')
  assert.equal(normalizeArchitecture('AArch64'), 'arm64')
})

test('normalizeArchitecture passes unknown architectures through untouched', () => {
  // Better an honest unexpected value on the board than a confidently wrong one.
  assert.equal(normalizeArchitecture('riscv64'), 'riscv64')
  assert.equal(normalizeArchitecture(' ppc64le '), 'ppc64le')
})

test('deriveOsName takes the name preceding the version', () => {
  assert.equal(deriveOsName('Ubuntu 24.04.4 LTS', '24.04'), 'Ubuntu')
  assert.equal(deriveOsName('Ubuntu 26.04 LTS', '26.04'), 'Ubuntu')
})

test('deriveOsName handles multi-word distro names', () => {
  assert.equal(deriveOsName('Debian GNU/Linux 12 (bookworm)', '12'), 'Debian GNU/Linux')
  assert.equal(deriveOsName('Red Hat Enterprise Linux 9.4 (Plow)', '9.4'), 'Red Hat Enterprise Linux')
})

test('deriveOsName falls back to the full description without a usable version', () => {
  assert.equal(deriveOsName('Ubuntu 24.04.4 LTS', null), 'Ubuntu 24.04.4 LTS')
  assert.equal(deriveOsName('Ubuntu 24.04.4 LTS', ''), 'Ubuntu 24.04.4 LTS')
  assert.equal(deriveOsName('Ubuntu 24.04.4 LTS', '   '), 'Ubuntu 24.04.4 LTS')
})

test('deriveOsName falls back when the version is absent from the description', () => {
  // Daemons have been known to disagree with themselves; don't truncate on a guess.
  assert.equal(deriveOsName('Alpine Linux v3.20', '3.20.1'), 'Alpine Linux v3.20')
})

test('deriveOsName falls back when the description begins with the version', () => {
  assert.equal(deriveOsName('12 Debian', '12'), '12 Debian')
})

test('deriveOsName trims surrounding whitespace', () => {
  assert.equal(deriveOsName('  Ubuntu 24.04.4 LTS  ', '24.04'), 'Ubuntu')
})
