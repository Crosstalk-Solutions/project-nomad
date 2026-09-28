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

const HSA_OVERRIDE_ENV_PREFIX = 'HSA_OVERRIDE_GFX_VERSION='
const HSA_OVERRIDE_VALUE_RE = /^\d+\.\d+\.\d+$/

/** The raw HSA_OVERRIDE_GFX_VERSION in a container env, or null when it is not set. */
export function readHsaOverrideFromEnv(env: string[] | null | undefined): string | null {
  const entry = (env ?? []).find((e) => e.startsWith(HSA_OVERRIDE_ENV_PREFIX))
  return entry ? entry.slice(HSA_OVERRIDE_ENV_PREFIX.length) : null
}

export type AmdHsaOverrideResolution = {
  value: string | null
  source: 'kv' | 'kv-disabled' | 'marker' | 'container' | 'default'
  /** Set when the KV held something unusable and was skipped. */
  invalidManual?: string
}

/**
 * Pick the HSA_OVERRIDE_GFX_VERSION an AMD install should apply. Resolution order:
 *   1. KV `ai.amdHsaOverride`: a version forces it, 'none'/'off'/'false' disables it.
 *   2. The gfx marker install_nomad.sh writes, mapped through mapGfxToHsaOverride. A
 *      marker is authoritative even when it maps to none.
 *   3. The override the existing container already runs with (#1377). Upgraded installs
 *      that got it by hand or from an older install path have neither 1 nor 2, and
 *      dropping a working override would push the GPU back to CPU.
 *   4. None, letting ROCm discover the GPU natively.
 */
export function pickAmdHsaOverride(input: {
  manual: unknown
  markerGfx: string | null
  containerEnv?: string[] | null
}): AmdHsaOverrideResolution {
  let invalidManual: string | undefined
  if (input.manual !== null && input.manual !== undefined && String(input.manual).trim() !== '') {
    const manual = String(input.manual).trim().toLowerCase()
    if (manual === 'none' || manual === 'off' || manual === 'false') {
      return { value: null, source: 'kv-disabled' }
    }
    if (HSA_OVERRIDE_VALUE_RE.test(manual)) return { value: manual, source: 'kv' }
    invalidManual = String(input.manual)
  }
  const extra = invalidManual !== undefined ? { invalidManual } : {}

  if (input.markerGfx !== null) {
    return { value: mapGfxToHsaOverride(input.markerGfx), source: 'marker', ...extra }
  }

  const existing = readHsaOverrideFromEnv(input.containerEnv)?.trim()
  if (existing && HSA_OVERRIDE_VALUE_RE.test(existing)) {
    return { value: existing, source: 'container', ...extra }
  }

  return { value: null, source: 'default', ...extra }
}
