/**
 * Auto-index guardrail thresholds and pure decision logic (RFC #883 §7).
 *
 * The guardrail fires when a user is about to commit to a bulk indexing
 * action (curated tier change, large multi-file upload, etc.) that would
 * use a substantial amount of disk for embedding storage. It's a one-time
 * confirmation step at scary thresholds — it doesn't fire for ordinary
 * everyday operations. After the user confirms once for a given batch
 * the action proceeds as it would have without the guardrail.
 *
 * Thresholds are intentionally conservative to avoid surprise consumption
 * of a user's storage. Tweak both constants if the field experience
 * suggests we're nagging users too aggressively.
 */

/** Absolute upper bound: estimates at or above this trip the guardrail. */
export const GUARDRAIL_ABSOLUTE_BYTES = 50 * 1024 * 1024 * 1024 // 50 GB

/** Relative-to-free-disk bound: estimates >= 10% of free disk trip too. */
export const GUARDRAIL_FREE_DISK_RATIO = 0.1

export type GuardrailReason =
  | {
      kind: 'over_absolute'
      estimateBytes: number
      thresholdBytes: number
    }
  | {
      kind: 'over_free_disk'
      estimateBytes: number
      freeBytes: number
      thresholdBytes: number
    }

export type GuardrailVerdict = {
  trips: boolean
  reasons: GuardrailReason[]
}

/**
 * Decide whether a bulk indexing action should be gated behind the
 * guardrail modal. Caller passes the precomputed embedding-storage
 * estimate (from `KbRatioRegistry.estimateBatch` in #891 / #897) and
 * the free-disk figure from system info. Pass `freeBytes = 0` to skip
 * the relative-disk check when free space isn't known.
 */
export function evaluateGuardrail(input: {
  estimateBytes: number
  freeBytes: number
}): GuardrailVerdict {
  const reasons: GuardrailReason[] = []

  if (input.estimateBytes >= GUARDRAIL_ABSOLUTE_BYTES) {
    reasons.push({
      kind: 'over_absolute',
      estimateBytes: input.estimateBytes,
      thresholdBytes: GUARDRAIL_ABSOLUTE_BYTES,
    })
  }

  if (input.freeBytes > 0) {
    const relativeThreshold = input.freeBytes * GUARDRAIL_FREE_DISK_RATIO
    if (input.estimateBytes >= relativeThreshold) {
      reasons.push({
        kind: 'over_free_disk',
        estimateBytes: input.estimateBytes,
        freeBytes: input.freeBytes,
        thresholdBytes: relativeThreshold,
      })
    }
  }

  return { trips: reasons.length > 0, reasons }
}
