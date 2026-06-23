import { IconAlertTriangle } from '@tabler/icons-react'

/**
 * "When to use what" — top-of-page safety banner.
 *
 * A prominent amber callout that renders at the TOP of both the condition index
 * and detail pages. This is a hard ship requirement (per the design spec), not a
 * footnote: results are FDA label-indication matches, NOT recommendations, NOT
 * an FDA endorsement, and NOT a drug-interaction checker.
 */
export default function SafetyBanner() {
  return (
    <div role="alert" className="mb-6 rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <IconAlertTriangle
          size={22}
          className="mt-0.5 flex-shrink-0 text-amber-600"
          aria-hidden="true"
        />
        <div className="text-sm text-amber-900">
          <p className="font-bold mb-1">Informational reference only — not medical advice.</p>
          <ul className="list-disc pl-5 space-y-0.5 text-amber-800">
            <li>
              These results match FDA drug-label indications to a situation. They are{' '}
              <strong>not a recommendation</strong> and <strong>not an FDA endorsement</strong>.
            </li>
            <li>
              This is <strong>not a drug-interaction checker</strong>. Read each label&rsquo;s full
              warnings, and check with a pharmacist or clinician before combining medicines.
            </li>
            <li>
              In an emergency, or if symptoms are severe or worsening,{' '}
              <strong>contact a medical professional or call emergency services</strong>.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
