import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { IconAlertTriangle } from '@tabler/icons-react'
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
                Before you use the Drug Reference
              </DialogTitle>
            </div>

            <div className="mt-4 space-y-3 text-sm text-text-secondary">
              <p>
                This tool shows general health information from official <strong>FDA drug labels</strong> and
                matches symptoms to over-the-counter options. It is provided for <strong>information only</strong>.
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  It is <strong>not medical advice</strong> and not a substitute for a doctor, pharmacist, or nurse.
                </li>
                <li>
                  It is <strong>not a drug-interaction checker</strong>. Always read each product&rsquo;s full label
                  and check with a professional before combining medicines.
                </li>
                <li>
                  Situation matches come from label text, not clinical recommendations — they can be incomplete or
                  include products you wouldn&rsquo;t expect.
                </li>
                <li>
                  Always follow the directions on the <strong>actual product you have</strong>; dosages and warnings
                  differ between products.
                </li>
                <li>
                  In an emergency, or if symptoms are severe, worsening, or you&rsquo;re unsure,{' '}
                  <strong>contact a medical professional or call emergency services</strong>.
                </li>
              </ul>
              <p className="text-xs text-text-muted">
                Data is from openFDA (U.S. FDA, public domain). NOMAD is not affiliated with or endorsed by the FDA.
              </p>
            </div>

            <div className="mt-6">
              <StyledButton variant="action" fullWidth onClick={acknowledge}>
                I understand — continue
              </StyledButton>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
