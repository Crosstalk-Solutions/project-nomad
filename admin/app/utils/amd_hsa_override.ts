/**
 * Map an AMD GPU's gfx target to the `HSA_OVERRIDE_GFX_VERSION` value the ollama:rocm
 * container needs, or `null` when the card is discovered natively and no override should
 * be applied.
 *
 * This is intentionally a pure function so the mapping is unit-testable without
 * constructing the Docker service or touching the container runtime. `DockerService`
 * delegates its private `_mapGfxToHsaOverride` to this.
 *
 * The bundled `ollama/ollama:rocm` rocblas ships kernels for a fixed allowlist — as seen
 * in ollama's own startup log:
 *   supported=[gfx1030, gfx1100/1101/1102, gfx1150/1151, gfx1200/1201, gfx908/90a/942/950]
 * A target NOT in that list is dropped to CPU unless we coerce it onto a supported one via
 * HSA_OVERRIDE_GFX_VERSION.
 *
 * Mapping:
 *  - gfx1030 / gfx1100 / gfx1101 / gfx1102 → none. Discrete RDNA 2/3 on the allowlist;
 *    forcing an override here breaks GPU discovery.
 *  - gfx1150 / gfx1151 (Strix 890M, Strix Halo) → none. RDNA 3.5 iGPUs that ARE on the
 *    allowlist under the bundled ROCm, so native discovery works. (#1076 got this right.)
 *  - gfx1103 (Phoenix/Hawk Point 780M/760M) → '11.0.0'. RDNA 3 iGPU that is NOT on the
 *    allowlist, so it must be coerced onto gfx1100's kernels. #1076 wrongly grouped it with
 *    gfx1150/1151 and dropped the override, silently sending the 780M to CPU (the very
 *    common iGPU this regression hit). 11.0.0 is the value that worked on v1.33.0 and that
 *    restores full GPU offload in the field; #1076's "gfx1100 WMMA fault" theory did not
 *    hold up.
 *  - gfx1031..gfx1036 (RDNA 2 iGPUs, e.g. Rembrandt 680M) → '10.3.0'. Not on the allowlist;
 *    coerce onto gfx1030.
 *  - anything else (unknown/newer target) → none. Prefer native discovery over a coercion
 *    that's likely wrong; a hardcoded default gets more wrong as ROCm adds native targets.
 */
export function mapGfxToHsaOverride(gfx: string): string | null {
  // Officially supported by the bundled ROCm — no override needed.
  if (gfx === 'gfx1030' || gfx === 'gfx1100' || gfx === 'gfx1101' || gfx === 'gfx1102') {
    return null
  }
  // RDNA 3.5 iGPUs (Strix 890M = gfx1150, Strix Halo = gfx1151) — natively supported.
  if (gfx === 'gfx1150' || gfx === 'gfx1151') {
    return null
  }
  // RDNA 3 Phoenix/Hawk Point (780M/760M = gfx1103) — NOT on the rocblas allowlist; coerce
  // to gfx1100 kernels or ollama drops it to CPU.
  if (gfx === 'gfx1103') {
    return '11.0.0'
  }
  // RDNA 2 variants + iGPUs (gfx1031..gfx1036, e.g. Rembrandt 680M) — coerce to gfx1030.
  if (/^gfx103[1-6]$/.test(gfx)) {
    return '10.3.0'
  }
  // Unknown/newer target: prefer native discovery over a coercion that's likely wrong.
  return null
}
