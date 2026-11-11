import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, rm, stat } from 'node:fs/promises'
import { lookup } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'
import type { MapPackArtifact } from '../../types/map_packs.js'
import { MapPackError } from './map_pack_manifest.js'

function classifyAddress(address: string, allowLocal: boolean) {
  let parsed = ipaddr.parse(address)
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address()
  }
  // Even an explicitly enabled local mirror must not reach cloud metadata.
  if (parsed.toString() === '169.254.169.254' || parsed.toString() === 'fd00:ec2::254') {
    throw new MapPackError('Cloud metadata addresses cannot host map packages')
  }
  if (!allowLocal && parsed.range() !== 'unicast') {
    throw new MapPackError('Local package mirrors require MAP_PACK_ALLOW_LOCAL_DOWNLOADS=true')
  }
}

export async function assertMapPackDownloadUrl(url: string, allowLocal = false) {
  const parsed = new URL(url)
  if (
    !['https:', 'http:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    (!allowLocal && parsed.protocol !== 'https:')
  ) {
    throw new MapPackError(
      'Map package downloads require HTTPS; local HTTP mirrors must be explicitly enabled'
    )
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '')
  if (ipaddr.isValid(hostname)) classifyAddress(hostname, allowLocal)
  else if (!allowLocal) {
    const addresses = await lookup(hostname, { all: true })
    if (!addresses.length) throw new MapPackError('Package mirror did not resolve')
    for (const address of addresses) classifyAddress(address.address, false)
  }
}

export async function verifyMapPackArtifact(path: string, artifact: MapPackArtifact) {
  const info = await stat(path)
  if (!info.isFile() || info.size !== artifact.size_bytes) {
    throw new MapPackError(
      `Package size mismatch: expected ${artifact.size_bytes} bytes, received ${info.size}`,
      422
    )
  }
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  if (digest.digest('hex') !== artifact.sha256) {
    throw new MapPackError('Package SHA-256 mismatch; the download has not been installed', 422)
  }
}

/** Resume a partial file, check every redirect, and bound writes to the declared size. */
export async function downloadMapPackArtifact(
  artifact: MapPackArtifact,
  path: string,
  options: { allowLocal?: boolean; onProgress?: (bytes: number) => Promise<void> } = {}
) {
  let offset = await stat(path)
    .then((s) => s.size)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return 0
      throw error
    })
  if (offset > artifact.size_bytes) {
    await rm(path)
    offset = 0
  }
  if (offset === artifact.size_bytes) return

  let url = artifact.url
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const resetTimeout = () => {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(new Error('Package download timed out')), 60_000)
    timer.unref()
  }
  try {
    let response: Response | undefined
    for (let redirects = 0; redirects <= 5; redirects++) {
      await assertMapPackDownloadUrl(url, options.allowLocal)
      resetTimeout()
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'Accept-Encoding': 'identity',
          ...(offset ? { Range: `bytes=${offset}-` } : {}),
        },
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location || redirects === 5)
          throw new MapPackError('Invalid or excessive package redirects')
        url = new URL(location, url).toString()
      } else break
    }
    if (!response || !response.ok || !response.body) {
      throw new MapPackError(`Package mirror returned HTTP ${response?.status ?? 'unknown'}`, 502)
    }
    if (response.status === 206) {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '')
      if (!range || Number(range[1]) !== offset || Number(range[3]) !== artifact.size_bytes) {
        await response.body.cancel()
        throw new MapPackError('Package mirror returned an invalid resume range', 502)
      }
    } else {
      // Mirrors may ignore Range; replace rather than append their complete response.
      offset = 0
    }
    const file = await open(path, offset ? 'a' : 'w')
    const reader = response.body.getReader()
    try {
      let downloaded = offset
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        resetTimeout()
        downloaded += value.byteLength
        if (downloaded > artifact.size_bytes) {
          controller.abort()
          throw new MapPackError('Package mirror exceeded the declared artifact size', 422)
        }
        await file.writeFile(value)
        await options.onProgress?.(downloaded)
      }
    } finally {
      reader.releaseLock()
      await file.close()
    }
  } finally {
    clearTimeout(timer)
  }
}
