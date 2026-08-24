import { IconAlertTriangle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

/**
 * "When to use what" — top-of-page safety banner.
 *
 * A prominent amber callout that renders at the TOP of both the condition index
 * and detail pages: results are FDA label-indication matches, NOT
 * recommendations, NOT an FDA endorsement, and NOT a drug-interaction checker.
 * It leads the page (not a footnote) so the caveat is read before any result.
 */
export default function SafetyBanner() {
  const { t } = useTranslation()

  return (
    <div role="alert" className="mb-6 rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <IconAlertTriangle
          size={22}
          className="mt-0.5 flex-shrink-0 text-amber-600"
          aria-hidden="true"
        />
        <div className="text-sm text-amber-900">
          <p className="font-bold mb-1">{t('conditions.safety_banner.title')}</p>
          <ul className="list-disc pl-5 space-y-0.5 text-amber-800">
            <li>
              {t('conditions.safety_banner.fda_match_prefix')}{' '}
              <strong>{t('conditions.safety_banner.not_a_recommendation')}</strong>{' '}
              {t('conditions.safety_banner.and')}{' '}
              <strong>{t('conditions.safety_banner.not_fda_endorsement')}</strong>.
            </li>
            <li>
              {t('conditions.safety_banner.not_interaction_checker_prefix')}{' '}
              <strong>{t('conditions.safety_banner.not_interaction_checker')}</strong>.{' '}
              {t('conditions.safety_banner.check_with_pharmacist')}
            </li>
            <li>
              {t('conditions.safety_banner.emergency_prefix')}{' '}
              <strong>{t('conditions.safety_banner.contact_medical')}</strong>.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
