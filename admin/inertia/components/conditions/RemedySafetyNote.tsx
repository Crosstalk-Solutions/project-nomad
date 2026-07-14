import { IconAlertTriangle } from '@tabler/icons-react'

/**
 * Co-located safety note for AFFIRMATIVE self-care / natural-remedy guidance.
 *
 * Distinct from {@link SafetyBanner}, which leads a page and frames FDA
 * label-indication *matches*. This note sits at the head of every block that
 * offers affirmative remedy guidance (the natural-remedy sections on the Drug
 * Reference and "When to use what" pages), so the "informational only, not
 * medical advice, seek real care in an emergency" framing appears WITH the
 * guidance itself — not only in a one-time banner the reader may have scrolled
 * past. Same amber alert language as SafetyBanner so the two read as one system.
 */
export default function RemedySafetyNote() {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"
    >
      <IconAlertTriangle
        size={18}
        className="mt-0.5 flex-shrink-0 text-amber-600"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="font-bold">Informational only — not medical advice.</p>
        <p className="text-amber-800">
          These remedies have limited or mixed evidence, are not FDA-evaluated, and are not a
          substitute for professional care. Check with a clinician before using any of them, and
          before combining one with a medication you already take.
        </p>
        <p className="text-amber-800">
          In an emergency, or if symptoms are severe or worsening,{' '}
          <strong>seek real medical care — call emergency services</strong>.
        </p>
      </div>
    </div>
  )
}
