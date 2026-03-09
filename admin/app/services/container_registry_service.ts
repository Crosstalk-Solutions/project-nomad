import logger from '@adonisjs/core/services/logger'
import { isNewerVersion, parseMajorVersion } from '../utils/version.js'

export interface ParsedImageReference {
  registry: string
  namespace: string
  repo: string
  tag: string
  /** Full name for registry API calls: namespace/repo */
  fullName: string
}

export interface AvailableUpdate {
  tag: string
  isLatest: boolean
  releaseUrl?: string
}

interface TokenCacheEntry {
  token: string
  expiresAt: number
}

const SEMVER_TAG_PATTERN = /^v?(\d+\.\d+(?:\.\d+)?)$/
const PLATFORM_SUFFIXES = ['-arm64', '-amd64', '-alpine', '-slim', '-cuda', '-rocm']
const REJECTED_TAGS = new Set(['latest', 'nightly', 'edge', 'dev', 'beta', 'alpha', 'canary', 'rc', 'test', 'debug'])

export class ContainerRegistryService {
  private tokenCache = new Map<string, TokenCacheEntry>()
  private sourceUrlCache = new Map<string, string | null>()
  private releaseTagPrefixCache = new Map<string, string>()

  /**
   * Parse a Docker image reference string into its components.
   */
  parseImageReference(image: string): ParsedImageReference {
    let registry: string
    let remainder: string
    let tag = 'latest'

    // Split off the tag
    const lastColon = image.lastIndexOf(':')
    if (lastColon > -1 && !image.substring(lastColon).includes('/')) {
      tag = image.substring(lastColon + 1)
      image = image.substring(0, lastColon)
    }

    // Determine registry vs image path
    const parts = image.split('/')

    if (parts.length === 1) {
      // e.g. "nginx" → Docker Hub library image
      registry = 'registry-1.docker.io'
      remainder = `library/${parts[0]}`
    } else if (parts.length === 2 && !parts[0].includes('.') && !parts[0].includes(':')) {
      // e.g. "ollama/ollama" → Docker Hub user image
      registry = 'registry-1.docker.io'
      remainder = image
    } else {
      // e.g. "ghcr.io/kiwix/kiwix-serve" → custom registry
      registry = parts[0]
      remainder = parts.slice(1).join('/')
    }

    const namespaceParts = remainder.split('/')
    const repo = namespaceParts.pop()!
    const namespace = namespaceParts.join('/')

    return {
      registry,
      namespace,
      repo,
      tag,
      fullName: remainder,
    }
  }

  /**
   * Get an anonymous auth token for the given registry and repository.
   * NOTE: This could be expanded in the future to support private repo authentication
   */
  private async getToken(registry: string, fullName: string): Promise<string> {
    const cacheKey = `${registry}/${fullName}`
    const cached = this.tokenCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token
    }

    let tokenUrl: string
    if (registry === 'registry-1.docker.io') {
      tokenUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${fullName}:pull`
    } else if (registry === 'ghcr.io') {
      tokenUrl = `https://ghcr.io/token?service=ghcr.io&scope=repository:${fullName}:pull`
    } else {
      // For other registries, try the standard v2 token endpoint
      tokenUrl = `https://${registry}/token?service=${registry}&scope=repository:${fullName}:pull`
    }

    const response = await this.fetchWithRetry(tokenUrl)
    if (!response.ok) {
      throw new Error(`Failed to get auth token from ${registry}: ${response.status}`)
    }

    const data = (await response.json()) as { token?: string; access_token?: string }
    const token = data.token || data.access_token || ''

    if (!token) {
      throw new Error(`No token returned from ${registry}`)
    }

    // Cache for 5 minutes (tokens usually last longer, but be conservative)
    this.tokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + 5 * 60 * 1000,
    })

    return token
  }

  /**
   * List all tags for a given image from the registry.
   */
  async listTags(parsed: ParsedImageReference): Promise<string[]> {
    const token = await this.getToken(parsed.registry, parsed.fullName)
    const allTags: string[] = []
    let url = `https://${parsed.registry}/v2/${parsed.fullName}/tags/list?n=1000`

    while (url) {
      const response = await this.fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error(`Failed to list tags for ${parsed.fullName}: ${response.status}`)
      }

      const data = (await response.json()) as { tags?: string[] }
      if (data.tags) {
        allTags.push(...data.tags)
      }

      // Handle pagination via Link header
      const linkHeader = response.headers.get('link')
      if (linkHeader) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        url = match ? match[1] : ''
      } else {
        url = ''
      }
    }

    return allTags
  }

  /**
   * Check if a specific tag supports the given architecture by fetching its manifest.
   */
  async checkArchSupport(parsed: ParsedImageReference, tag: string, hostArch: string): Promise<boolean> {
    try {
      const token = await this.getToken(parsed.registry, parsed.fullName)
      const url = `https://${parsed.registry}/v2/${parsed.fullName}/manifests/${tag}`

      const response = await this.fetchWithRetry(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: [
            'application/vnd.oci.image.index.v1+json',
            'application/vnd.docker.distribution.manifest.list.v2+json',
            'application/vnd.oci.image.manifest.v1+json',
            'application/vnd.docker.distribution.manifest.v2+json',
          ].join(', '),
        },
      })

      if (!response.ok) return true // If we can't check, assume it's compatible

      const manifest = (await response.json()) as {
        mediaType?: string
        manifests?: Array<{ platform?: { architecture?: string } }>
      }
      const mediaType = manifest.mediaType || response.headers.get('content-type') || ''

      // Manifest list — check if any platform matches
      if (
        mediaType.includes('manifest.list') ||
        mediaType.includes('image.index') ||
        manifest.manifests
      ) {
        const manifests = manifest.manifests || []
        return manifests.some(
          (m: any) => m.platform && m.platform.architecture === hostArch
        )
      }

      // Single manifest — assume compatible (can't easily determine arch without fetching config blob)
      return true
    } catch (error) {
      logger.warn(`[ContainerRegistryService] Error checking arch for ${tag}: ${error.message}`)
      return true // Assume compatible on error
    }
  }

  /**
   * Extract the source repository URL from an image's OCI labels.
   * Uses the standardized `org.opencontainers.image.source` label.
   * Result is cached per image (not per tag).
   */
  async getSourceUrl(parsed: ParsedImageReference): Promise<string | null> {
    const cacheKey = `${parsed.registry}/${parsed.fullName}`
    if (this.sourceUrlCache.has(cacheKey)) {
      return this.sourceUrlCache.get(cacheKey)!
    }

    try {
      const token = await this.getToken(parsed.registry, parsed.fullName)

      // First get the manifest to find the config blob digest
      const manifestUrl = `https://${parsed.registry}/v2/${parsed.fullName}/manifests/${parsed.tag}`
      const manifestRes = await this.fetchWithRetry(manifestUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: [
            'application/vnd.oci.image.manifest.v1+json',
            'application/vnd.docker.distribution.manifest.v2+json',
            'application/vnd.oci.image.index.v1+json',
            'application/vnd.docker.distribution.manifest.list.v2+json',
          ].join(', '),
        },
      })

      if (!manifestRes.ok) {
        this.sourceUrlCache.set(cacheKey, null)
        return null
      }

      const manifest = (await manifestRes.json()) as {
        config?: { digest?: string }
        manifests?: Array<{ digest?: string; mediaType?: string; platform?: { architecture?: string } }>
      }

      // If this is a manifest list, pick the first manifest to get the config
      let configDigest = manifest.config?.digest
      if (!configDigest && manifest.manifests?.length) {
        const firstManifest = manifest.manifests[0]
        if (firstManifest.digest) {
          const childRes = await this.fetchWithRetry(
            `https://${parsed.registry}/v2/${parsed.fullName}/manifests/${firstManifest.digest}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
              },
            }
          )
          if (childRes.ok) {
            const childManifest = (await childRes.json()) as { config?: { digest?: string } }
            configDigest = childManifest.config?.digest
          }
        }
      }

      if (!configDigest) {
        this.sourceUrlCache.set(cacheKey, null)
        return null
      }

      // Fetch the config blob to read labels
      const blobUrl = `https://${parsed.registry}/v2/${parsed.fullName}/blobs/${configDigest}`
      const blobRes = await this.fetchWithRetry(blobUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!blobRes.ok) {
        this.sourceUrlCache.set(cacheKey, null)
        return null
      }

      const config = (await blobRes.json()) as {
        config?: { Labels?: Record<string, string> }
      }

      const sourceUrl = config.config?.Labels?.['org.opencontainers.image.source'] || null
      this.sourceUrlCache.set(cacheKey, sourceUrl)
      return sourceUrl
    } catch (error) {
      logger.warn(`[ContainerRegistryService] Failed to get source URL for ${cacheKey}: ${error.message}`)
      this.sourceUrlCache.set(cacheKey, null)
      return null
    }
  }

  /**
   * Detect whether a GitHub/GitLab repo uses a 'v' prefix on release tags.
   * Probes the GitHub API with the current tag to determine the convention,
   * then caches the result per source URL.
   */
  async detectReleaseTagPrefix(sourceUrl: string, sampleTag: string): Promise<string> {
    if (this.releaseTagPrefixCache.has(sourceUrl)) {
      return this.releaseTagPrefixCache.get(sourceUrl)!
    }

    try {
      const url = new URL(sourceUrl)
      if (url.hostname !== 'github.com') {
        this.releaseTagPrefixCache.set(sourceUrl, '')
        return ''
      }

      const cleanPath = url.pathname.replace(/\.git$/, '').replace(/\/$/, '')
      const strippedTag = sampleTag.replace(/^v/, '')
      const vTag = `v${strippedTag}`

      // Try both variants against GitHub's API — the one that 200s tells us the convention
      // Try v-prefixed first since it's more common
      const vRes = await this.fetchWithRetry(
        `https://api.github.com/repos${cleanPath}/releases/tags/${vTag}`,
        { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'ProjectNomad' } },
        1
      )
      if (vRes.ok) {
        this.releaseTagPrefixCache.set(sourceUrl, 'v')
        return 'v'
      }

      const plainRes = await this.fetchWithRetry(
        `https://api.github.com/repos${cleanPath}/releases/tags/${strippedTag}`,
        { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'ProjectNomad' } },
        1
      )
      if (plainRes.ok) {
        this.releaseTagPrefixCache.set(sourceUrl, '')
        return ''
      }
    } catch {
      // On error, fall through to default
    }

    // Default: no prefix modification
    this.releaseTagPrefixCache.set(sourceUrl, '')
    return ''
  }

  /**
   * Build a release URL for a specific tag given a source repository URL and
   * the detected release tag prefix convention.
   * Supports GitHub and GitLab URL patterns.
   */
  buildReleaseUrl(sourceUrl: string, tag: string, releaseTagPrefix: string): string | undefined {
    try {
      const url = new URL(sourceUrl)
      if (url.hostname === 'github.com' || url.hostname.includes('gitlab')) {
        const cleanPath = url.pathname.replace(/\.git$/, '').replace(/\/$/, '')
        const strippedTag = tag.replace(/^v/, '')
        const releaseTag = releaseTagPrefix ? `${releaseTagPrefix}${strippedTag}` : strippedTag
        return `${url.origin}${cleanPath}/releases/tag/${releaseTag}`
      }
    } catch {
      // Invalid URL, skip
    }
    return undefined
  }

  /**
   * Filter and sort tags to find compatible updates for a service.
   */
  filterCompatibleUpdates(
    tags: string[],
    currentTag: string,
    majorVersion: number
  ): string[] {
    return tags
      .filter((tag) => {
        // Must match semver pattern
        if (!SEMVER_TAG_PATTERN.test(tag)) return false

        // Reject known non-version tags
        if (REJECTED_TAGS.has(tag.toLowerCase())) return false

        // Reject platform suffixes
        if (PLATFORM_SUFFIXES.some((suffix) => tag.toLowerCase().endsWith(suffix))) return false

        // Must be same major version
        if (parseMajorVersion(tag) !== majorVersion) return false

        // Must be newer than current
        return isNewerVersion(tag, currentTag)
      })
      .sort((a, b) => (isNewerVersion(a, b) ? -1 : 1)) // Newest first
  }

  /**
   * High-level method to get available updates for a service.
   * Returns a sorted list of compatible newer versions (newest first).
   */
  async getAvailableUpdates(
    containerImage: string,
    hostArch: string,
    fallbackSourceRepo?: string | null
  ): Promise<AvailableUpdate[]> {
    const parsed = this.parseImageReference(containerImage)
    const currentTag = parsed.tag

    if (currentTag === 'latest') {
      logger.warn(
        `[ContainerRegistryService] Cannot check updates for ${containerImage} — using :latest tag`
      )
      return []
    }

    const majorVersion = parseMajorVersion(currentTag)

    // Fetch tags and source URL in parallel
    const [tags, ociSourceUrl] = await Promise.all([
      this.listTags(parsed),
      this.getSourceUrl(parsed),
    ])

    // OCI label takes precedence, fall back to DB-stored source_repo
    const sourceUrl = ociSourceUrl || fallbackSourceRepo || null

    const compatible = this.filterCompatibleUpdates(tags, currentTag, majorVersion)

    // Detect release tag prefix convention (e.g. 'v' vs no prefix) if we have a source URL
    let releaseTagPrefix = ''
    if (sourceUrl) {
      releaseTagPrefix = await this.detectReleaseTagPrefix(sourceUrl, currentTag)
    }

    // Check architecture support for the top candidates (limit checks to save API calls)
    const maxArchChecks = 10
    const results: AvailableUpdate[] = []

    for (const tag of compatible.slice(0, maxArchChecks)) {
      const supported = await this.checkArchSupport(parsed, tag, hostArch)
      if (supported) {
        results.push({
          tag,
          isLatest: results.length === 0,
          releaseUrl: sourceUrl ? this.buildReleaseUrl(sourceUrl, tag, releaseTagPrefix) : undefined,
        })
      }
    }

    // For remaining tags (beyond arch check limit), include them but mark as not latest
    for (const tag of compatible.slice(maxArchChecks)) {
      results.push({
        tag,
        isLatest: false,
        releaseUrl: sourceUrl ? this.buildReleaseUrl(sourceUrl, tag, releaseTagPrefix) : undefined,
      })
    }

    return results
  }

  /**
   * Fetch with retry and exponential backoff for rate limiting.
   */
  private async fetchWithRetry(
    url: string,
    init?: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await fetch(url, init)

      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = response.headers.get('retry-after')
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, attempt) * 1000
        logger.warn(
          `[ContainerRegistryService] Rate limited on ${url}, retrying in ${delay}ms`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      return response
    }

    throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`)
  }
}
