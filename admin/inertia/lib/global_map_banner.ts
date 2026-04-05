export function hasDownloadedGlobalMap(
  globalMapKey: string | null | undefined,
  storedMapFiles: Array<{ name: string }>
): boolean {
  if (!globalMapKey) {
    return false
  }

  return storedMapFiles.some((file) => file.name === globalMapKey)
}
