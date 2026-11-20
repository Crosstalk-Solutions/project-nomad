import { open } from 'node:fs/promises'
import { bytesToHeader } from 'pmtiles'

// PMTiles v3 fixed header is exactly 127 bytes. Reading only the header keeps this
// O(1) even for multi-GB archives.
export const PMTILES_HEADER_LENGTH = 127

// Magic check mirrors getHeaderAndRoot in the pmtiles library: the first uint16
// (little-endian) must be 0x4D50 ("PM" of "PMTILES").
const PMTILES_MAGIC_UINT16 = 19792

/**
 * Reads the max zoom level recorded in a PMTiles archive header.
 *
 * Returns null when the file is missing, too short, or not a PMTiles archive —
 * callers should treat null as "unknown zoom ceiling" and fall back to previous
 * behavior rather than fail style generation.
 */
export async function readPmtilesMaxZoom(filepath: string): Promise<number | null> {
  let file
  try {
    file = await open(filepath, 'r')
  } catch {
    return null
  }
  try {
    const buffer = Buffer.alloc(PMTILES_HEADER_LENGTH)
    const { bytesRead } = await file.read(buffer, 0, PMTILES_HEADER_LENGTH, 0)
    if (bytesRead < PMTILES_HEADER_LENGTH) return null
    if (buffer.readUInt16LE(0) !== PMTILES_MAGIC_UINT16) return null
    // bytesToHeader builds a DataView over its argument; the runtime only accepts an
    // actual ArrayBuffer there (a Buffer/Uint8Array throws), so hand it the exact slice.
    const headerBytes = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    )
    const header = bytesToHeader(headerBytes)
    return header.maxZoom
  } catch {
    return null
  } finally {
    await file.close()
  }
}
