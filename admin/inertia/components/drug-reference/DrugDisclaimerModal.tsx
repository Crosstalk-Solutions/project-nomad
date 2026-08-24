import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import StyledButton from '~/components/StyledButton'

/**
 * localStorage key for the Drug Reference disclaimer acknowledgement. Versioned:
 * bump the suffix if the disclaimer text changes materially so every browser is
 * re-prompted. Per-browser by design — a new browser/device gets the gate again.
 */
export const DRUG_DISCLAIMER_ACK_KEY = 'nomad:drugReferenceDisclaimer:v1'

export function hasAcknowledgedDrugDisclaimer(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(DRUG_DISCLAIMER_ACK_KEY) === 'ack'
  } catch {
    return false
  }
}

/**
 * First-open disclaimer gate for the Drug Reference. Blocks the page until the
 * user acknowledges (no backdrop / Escape dismissal). On acknowledgement the
 * acceptance is saved to this browser's localStorage so it isn't shown again on
 * this browser — other browsers/devices see it on their first open.
 */
export default function DrugDisclaimerModal({ open, onAcknowledge }: { open: boolean; onAcknowledge: () => void }) {
  const { t } = useTranslation()

  const acknowledge = () => {
    try {
      window.localStorage.setItem(DRUG_DISCLAIMER_ACK_KEY, 'ack')
    } catch {
      // Private mode / storage disabled — still let them through for this session.
    }
    onAcknowledge()
  }

  return (
    <Dialog open={open} onClose={() => {}} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/60" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
          <DialogPanel className="relative w-full transform overflow-hidden rounded-lg bg-surface-primary px-5 pb-5 pt-6 text-left shadow-xl transition-all sm:my-8 sm:max-w-lg sm:p-6">
            <div className="flex flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-desert-orange/15 text-desert-orange-dark">
                <IconAlertTriangle size={26} />
              </span>
              <DialogTitle as="h3" className="mt-4 text-lg font-bold text-text-primary">
                {t('drug_reference.disclaimer.title')}
              </DialogTitle>
            </div>

            <div className="mt-4 space-y-3 text-sm text-text-secondary">
              <p
                dangerouslySetInnerHTML={{
                  __html: t('drug_reference.disclaimer.intro'),
                }}
              />
              <ul className="list-disc space-y-1.5 pl-5">
                <li
                  dangerouslySetInnerHTML={{
                    __html: t('drug_reference.disclaimer.point_not_advice'),
                  }}
                />
                <li
                  dangerouslySetInnerHTML={{
                    __html: t('drug_reference.disclaimer.point_not_interaction_checker'),
                  }}
                />
                <li>{t('drug_reference.disclaimer.point_incomplete_matches')}</li>
                <li
                  dangerouslySetInnerHTML={{
                    __html: t('drug_reference.disclaimer.point_follow_label'),
                  }}
                />
                <li
                  dangerouslySetInnerHTML={{
                    __html: t('drug_reference.disclaimer.point_emergency'),
                  }}
                />
              </ul>
              <p className="text-xs text-text-muted">{t('drug_reference.disclaimer.fda_attribution')}</p>
            </div>

            <div className="mt-6">
              <StyledButton variant="action" fullWidth onClick={acknowledge}>
                {t('drug_reference.disclaimer.acknowledge_button')}
              </StyledButton>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
