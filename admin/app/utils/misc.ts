const DEFAULT_REPO_URL = 'https://github.com/Crosstalk-Solutions/project-nomad'

export function getRepoUrl(): string {
  return (process.env.NOMAD_REPO_URL || DEFAULT_REPO_URL).replace(/\/+$/, '')
}

export function getRepoRawUrl(branch: string = 'main'): string {
  const repoUrl = getRepoUrl()
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
  if (match) {
    return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/refs/heads/${branch}`
  }
  return `${repoUrl}/raw/refs/heads/${branch}`
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function parseBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    return lower === 'true' || lower === '1'
  }
  if (typeof value === 'number') {
    return value === 1
  }
  return false
}