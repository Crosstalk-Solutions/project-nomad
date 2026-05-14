import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { IconAlertTriangle, IconX } from '@tabler/icons-react'
import { formatBytes } from '~/lib/util'
import StyledButton from './StyledButton'
import type { GuardrailVerdict } from '~/lib/kb_guardrail'

/**
 * One-time confirmation modal for bulk indexing actions that trip the
 * disk-usage thresholds in `lib/kb_guardrail.ts`. The caller (e.g.
 * TierSelectionModal) decides whether to show the modal by evaluating the
 * guardrail BEFORE submit; this component just presents the verdict and
 * passes the user's choice back via `onConfirm` / `onCancel`.
 */
interface KbGuardrailModalProps {
  isOpen: boolean
  verdict: GuardrailVerdict
  onConfirm: () => void
  onCancel: () => void
}

export default function KbGuardrailModal({
  isOpen,
  verdict,
  onConfirm,
  onCancel,
}: KbGuardrailModalProps) {
  // The primary number to surface — every triggered reason carries the same
  // estimateBytes, so just grab the first one. `0` is a defensive fallback
  // for the (impossible-by-construction) "open with empty verdict" case.
  const estimateBytes = verdict.reasons[0]?.estimateBytes ?? 0
  const freeReason = verdict.reasons.find((r) => r.kind === 'over_free_disk')

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[60]" onClose={onCancel}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-lg bg-surface-primary shadow-xl transition-all">
                <div className="bg-amber-50 dark:bg-amber-950/30 px-6 py-4 border-b border-amber-200 dark:border-amber-800 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <IconAlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-300 flex-shrink-0 mt-0.5" />
                    <Dialog.Title className="text-lg font-semibold text-text-primary">
                      Confirm large AI indexing operation
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={onCancel}
                    className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
                    aria-label="Cancel"
                  >
                    <IconX size={20} />
                  </button>
                </div>

                <div className="px-6 py-5 space-y-3">
                  <p className="text-text-primary text-sm">
                    Indexing this batch for the AI Assistant will use approximately{' '}
                    <strong>{formatBytes(estimateBytes, 1)}</strong> of disk space for embeddings, on top of the raw downloads.
                  </p>

                  {freeReason && (
                    <p className="text-text-secondary text-sm">
                      That's more than 10% of your remaining free disk space ({formatBytes(freeReason.freeBytes, 1)} free). Embedding can take several hours and is hard to interrupt cleanly once started.
                    </p>
                  )}

                  <p className="text-text-secondary text-sm">
                    If you'd rather review per-item before indexing, cancel here and switch your Auto-index setting to <strong>Manual</strong> from the Knowledge Base panel.
                  </p>
                </div>

                <div className="bg-surface-secondary px-6 py-4 flex justify-end gap-3">
                  <StyledButton variant="outline" size="md" onClick={onCancel}>
                    Cancel
                  </StyledButton>
                  <StyledButton variant="primary" size="md" onClick={onConfirm}>
                    Proceed anyway
                  </StyledButton>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
