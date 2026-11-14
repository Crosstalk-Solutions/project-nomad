/** GPU vendors named by the acceleration paths NOMAD actually ships. */
export type GpuVendorKey = 'nvidia' | 'amd' | 'intel'

/**
 * Which of the known GPU vendors is this `si.graphics()` vendor string?
 *
 * The AMD arm is deliberately loose: pci.ids reports "Advanced Micro Devices,
 * Inc." on some cards and "ATI Technologies Inc." on older ones, and lspci output
 * reaches us with whatever casing the host had.
 *
 * Returns null for a vendor that is none of the three. Callers must treat that as
 * "no opinion" rather than "unsupported" — an unidentified card may well be a
 * future NVIDIA part behind a newer pci.ids.
 */
export function classifyGpuVendor(vendor: string | null | undefined): GpuVendorKey | null {
  const v = (vendor ?? '').trim()
  if (/intel/i.test(v)) return 'intel'
  if (/nvidia/i.test(v)) return 'nvidia'
  if (/advanced micro devices|\bamd\b|\bati\b/i.test(v)) return 'amd'
  return null
}

/**
 * The GPU vendor on this box that NOMAD has no acceleration path for, if any.
 *
 * NOMAD accelerates Ollama over CUDA (NVIDIA) or ROCm (AMD) and nothing else, so
 * a box whose only visible controller is an Intel iGPU can never run inference
 * on it — Ollama has no Intel backend. Returning null when an NVIDIA or AMD
 * controller is present keeps hybrid laptops (Intel iGPU + NVIDIA dGPU) on the
 * existing path: those boxes do have a working route, so the runtime probe above
 * stays authoritative for them and this must not pre-empt it.
 *
 * An unidentified vendor is deliberately not reported. This runs on the branch
 * where nothing was probed, so guessing "unsupported" from an unrecognised vendor
 * string would turn a healthy NVIDIA box into a false alarm.
 */
export function findUnacceleratedGpuVendor(
  controllers: ReadonlyArray<{ vendor?: string | null }> | null | undefined
): GpuVendorKey | null {
  let unaccelerated: GpuVendorKey | null = null
  for (const controller of controllers ?? []) {
    const vendor = classifyGpuVendor(controller?.vendor)
    if (vendor === 'nvidia' || vendor === 'amd') return null
    if (vendor === 'intel' && !unaccelerated) unaccelerated = 'intel'
  }
  return unaccelerated
}

/**
 * Is this GPU "model" a placeholder rather than a real name?
 *
 * systeminformation resolves PCI ids against the container's pci.ids database.
 * When a card is newer than that file it reports the raw id verbatim — an RTX
 * 5060 comes back as "Device 2d05". Vendor detection still succeeds, so these
 * strings otherwise pass as legitimate model names.
 *
 * Deliberately narrow: it must never reject a real product name. No shipping
 * GPU is called "Device" followed by four hex digits, and the Microsoft entries
 * below are placeholder adapter names that appear nowhere outside a Windows or
 * WSL graphics stack.
 *
 * Lives in its own module rather than beside its first caller because both the
 * leaderboard submission path and the Settings > System display path need the
 * same answer, and they diverged once already: #1165 fixed the submission and
 * left the System page reporting the raw id (#1196). One definition, two
 * callers, so the next placeholder shape only has to be added once.
 */
export function isUnresolvedGpuModel(model: string): boolean {
  const s = model.trim()
  if (s === '') return true
  if (/^device\s+[0-9a-f]{4}$/i.test(s)) return true
  if (/^unknown$/i.test(s)) return true
  // WSL2 exposes the GPU through /dev/dxg rather than the real adapter, so
  // si.graphics() reports Microsoft's generic placeholder even while CUDA work
  // is running on a physical card. Left unhandled, an RTX 3090 reaches the
  // public leaderboard labelled "Microsoft Basic Render Driver", which is worse
  // than no label: it is wrong, and it fragments per-hardware grouping (#1218).
  //
  // These are Microsoft's own placeholder adapter names and appear nowhere
  // outside a Windows/WSL graphics stack, so this cannot reject a real product
  // name on a native Linux host.
  if (/^microsoft basic (render driver|display adapter)$/i.test(s)) return true
  return false
}
