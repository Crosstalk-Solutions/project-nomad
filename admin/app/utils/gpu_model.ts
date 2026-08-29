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
