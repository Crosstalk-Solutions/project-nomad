import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const OPENHOP_CONTEXT = `## openHop

openHop is an open-source LoRa mesh communications project. This NOMAD build includes openHop Repeater in the Supply Depot. Its optional NOMAD Bridge plugin forwards incoming MeshCore direct messages to NOMAD's AI chat API and sends the answers back over radio. A user may therefore be talking to you through openHop rather than the NOMAD web interface. The bridge supports direct messages, not channel chat. Do not infer that an integration is unsupported merely because no matching knowledge-base passage was retrieved. Availability does not mean the repeater or bridge is installed, configured, or currently connected.
`

/** Run once during migration, never on chat reads or every startup. */
export async function seedOpenHopNomadContext(filePath: string): Promise<void> {
  let existing = ''
  try {
    existing = await readFile(filePath, 'utf8')
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }

  // Keep user-authored sections authoritative; also makes a migration retry safe.
  if (/^#{1,6}\s+openHop\b.*$/im.test(existing)) return

  await mkdir(dirname(filePath), { recursive: true })
  // Append rather than replacing the file: existing instructions stay byte-for-byte intact.
  await appendFile(filePath, `${existing ? '\n\n' : ''}${OPENHOP_CONTEXT}`, 'utf8')
}
