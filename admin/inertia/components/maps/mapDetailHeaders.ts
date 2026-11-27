import { bytesToHeader, FetchSource, type Header } from 'pmtiles'

type HeaderReader = (url: string, signal: AbortSignal) => Promise<Header>
type Entry = { promise: Promise<Header>; controller: AbortController; settled: boolean }

/** A header needs only its fixed 127 bytes, not a PMTiles root-directory fetch. */
export async function readMapDetailHeader(url: string, signal: AbortSignal): Promise<Header> {
  const { data, etag } = await new FetchSource(url).getBytes(0, 127, signal)
  const bytes = new Uint8Array(data)
  if (bytes.length !== 127 || String.fromCharCode(...bytes.slice(0, 7)) !== 'PMTiles' || bytes[7] !== 3) {
    throw new Error('The local map returned an invalid PMTiles header.')
  }
  const header = bytesToHeader(data, etag)
  if (header.minZoom > header.maxZoom || header.maxZoom > 30
      || ![header.minLon, header.minLat, header.maxLon, header.maxLat].every(Number.isFinite)) {
    throw new Error('The local map returned invalid native-detail metadata.')
  }
  return header
}

/** Bounded per-page metadata, including cancellation of requests that never settle. */
export class MapDetailHeaderCache {
  private entries = new Map<string, Entry>()

  constructor(
    private readonly reader: HeaderReader = readMapDetailHeader,
    private readonly options = { timeoutMs: 4000, maxEntries: 96 },
  ) {}

  get(url: string): Promise<Header> {
    const cached = this.entries.get(url)
    if (cached) {
      this.entries.delete(url)
      this.entries.set(url, cached)
      return cached.promise
    }
    while (this.entries.size >= this.options.maxEntries) {
      const key = this.entries.keys().next().value!
      const oldest = this.entries.get(key)!
      this.entries.delete(key)
      if (!oldest.settled) oldest.controller.abort(new Error('The map metadata request was evicted.'))
    }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let onAbort: () => void
    const deadline = new Promise<Header>((_resolve, reject) => {
      onAbort = () => reject(controller.signal.reason ?? new Error('The map metadata request was cancelled.'))
      controller.signal.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => controller.abort(new Error('Reading local map detail timed out.')), this.options.timeoutMs)
    })
    const reading = Promise.resolve().then(() => {
      controller.signal.throwIfAborted()
      return this.reader(url, controller.signal)
    })
    const entry: Entry = { controller, settled: false, promise: Promise.race([reading, deadline]).then(
      (header) => { finish(); return header },
      (error: unknown) => {
        finish()
        if (this.entries.get(url) === entry) this.entries.delete(url)
        throw error
      },
    ) }
    function finish() {
      entry.settled = true
      clearTimeout(timer)
      controller.signal.removeEventListener('abort', onAbort)
    }
    this.entries.set(url, entry)
    return entry.promise
  }

  cancelPending() {
    for (const [url, entry] of this.entries) if (!entry.settled) {
      this.entries.delete(url)
      entry.controller.abort(new Error('The map metadata view changed.'))
    }
  }

  clear() {
    this.cancelPending()
    this.entries.clear()
  }
}
