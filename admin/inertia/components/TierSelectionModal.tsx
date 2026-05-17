import { Fragment, useState, useEffect, useMemo } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { IconX, IconCheck, IconInfoCircle } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import type { CategoryWithStatus, SpecTier, SpecResource } from '../../types/collections'
import { resolveTierResources } from '~/lib/collections'
import { formatBytes } from '~/lib/util'
import api from '~/lib/api'
import classNames from 'classnames'
import DynamicIcon, { DynamicIconName } from './DynamicIcon'
import StyledButton from './StyledButton'
import KbGuardrailModal from './KbGuardrailModal'
import { evaluateGuardrail, type GuardrailVerdict } from '~/lib/kb_guardrail'
import { useSystemInfo } from '~/hooks/useSystemInfo'
import { getPrimaryDiskInfo } from '~/hooks/useDiskDisplayData'

/**
 * Filename for the embed-estimate registry lookup. Strips the URL path so
 * patterns like `wikipedia_en_simple_` continue to match upstream filenames
 * regardless of mirror domain.
 */
function resourceFilename(resource: SpecResource): string {
  const last = resource.url.split('/').pop()
  return last && last.length > 0 ? last : resource.id
}

interface TierSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  category: CategoryWithStatus | null
  selectedTierSlug?: string | null
  onSelectTier: (category: CategoryWithStatus, tier: SpecTier) => void
}

const TierSelectionModal: React.FC<TierSelectionModalProps> = ({
  isOpen,
  onClose,
  category,
  selectedTierSlug,
  onSelectTier,
}) => {
  // Local selection state - initialized from prop
  const [localSelectedSlug, setLocalSelectedSlug] = useState<string | null>(null)

  // Reset local selection when modal opens or category changes
  useEffect(() => {
    if (isOpen && category) {
      setLocalSelectedSlug(selectedTierSlug || null)
    }
  }, [isOpen, category, selectedTierSlug])

  // Get all resources for a tier (including inherited resources). Defined as a
  // hook-safe closure (always callable, returns [] when no category) so the
  // memo below can depend on `category` without breaking hook order.
  const getAllResourcesForTier = (tier: SpecTier): SpecResource[] => {
    if (!category) return []
    return resolveTierResources(tier, category.tiers)
  }

  // Pre-compute the selected tier's resources outside the JSX so hooks below
  // don't re-run on every render. Empty array when no selection.
  const selectedTierResources = useMemo<SpecResource[]>(() => {
    if (!category || !localSelectedSlug) return []
    const tier = category.tiers.find((t) => t.slug === localSelectedSlug)
    return tier ? resolveTierResources(tier, category.tiers) : []
  }, [category, localSelectedSlug])

  const embedEstimateRequest = useMemo(
    () =>
      selectedTierResources.map((r) => ({
        filename: resourceFilename(r),
        sizeBytes: Math.round(r.size_mb * 1024 * 1024),
      })),
    [selectedTierResources]
  )

  const { data: embedEstimate, isLoading: isEstimating } = useQuery({
    queryKey: ['embedEstimateBatch', embedEstimateRequest],
    queryFn: () => api.estimateEmbeddingBatch(embedEstimateRequest),
    enabled: embedEstimateRequest.length > 0,
    staleTime: 5 * 60_000,
  })

  const { data: ingestPolicySetting } = useQuery({
    queryKey: ['ingestPolicy'],
    queryFn: () => api.getSetting('rag.defaultIngestPolicy'),
  })

  // System info for the disk-free side of the guardrail. Shared queryKey with
  // the home / easy-setup pages so we don't refetch when the user already has
  // a fresh copy in cache from a sibling component.
  const { data: systemInfo } = useSystemInfo({ enabled: true })

  // Open state for the guardrail modal — separate from the tier modal so the
  // user sees the warning as an overlay without losing their tier selection
  // underneath. Cancel returns to the tier modal as-is; Proceed closes both
  // and runs the original onSelectTier path.
  const [guardrailVerdict, setGuardrailVerdict] = useState<GuardrailVerdict | null>(null)
  const ingestPolicy: 'Always' | 'Manual' =
    ingestPolicySetting?.value === 'Manual' ? 'Manual' : 'Always'

  if (!category) return null

  const getTierTotalSize = (tier: SpecTier): number => {
    return getAllResourcesForTier(tier).reduce((acc, r) => acc + r.size_mb * 1024 * 1024, 0)
  }

  const handleTierClick = (tier: SpecTier) => {
    // Toggle selection: if clicking the same tier, deselect it
    if (localSelectedSlug === tier.slug) {
      setLocalSelectedSlug(null)
    } else {
      setLocalSelectedSlug(tier.slug)
    }
  }

  // Compute disk-free bytes from system info; 0 means "unknown", which the
  // guardrail helper treats as "skip the relative-disk check".
  const freeBytes = useMemo<number>(() => {
    const primary = getPrimaryDiskInfo(systemInfo?.disk, systemInfo?.fsSize)
    if (!primary) return 0
    return Math.max(0, primary.totalSize - primary.totalUsed)
  }, [systemInfo])

  /**
   * Runs the original onSelectTier-then-onClose flow. Pulled out of
   * handleSubmit so the guardrail modal's confirm path can call it after
   * the user has consented to the large operation.
   */
  const finalizeSubmit = () => {
    if (!localSelectedSlug || !category) return
    const selectedTier = category.tiers.find((t) => t.slug === localSelectedSlug)
    if (selectedTier) {
      onSelectTier(category, selectedTier)
    }
    onClose()
  }

  const handleSubmit = () => {
    if (!localSelectedSlug || !category) return

    // Guardrail only runs when we have an estimate AND the global policy
    // would auto-index this batch. Under Manual the user has already opted
    // out of automatic ingestion, so the bulk-disk warning would be a false
    // alarm — the files would just queue as pending_decision.
    if (ingestPolicy === 'Always' && embedEstimate) {
      const verdict = evaluateGuardrail({
        estimateBytes: embedEstimate.totalBytes,
        freeBytes,
      })
      if (verdict.trips) {
        setGuardrailVerdict(verdict)
        return
      }
    }

    finalizeSubmit()
  }

  return (
    <>
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-lg bg-surface-primary shadow-xl transition-all">
                {/* Header */}
                <div className="bg-desert-green px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <DynamicIcon
                        icon={category.icon as DynamicIconName}
                        className="w-8 h-8 text-white mr-3"
                      />
                      <div>
                        <Dialog.Title className="text-xl font-semibold text-white">
                          {category.name}
                        </Dialog.Title>
                        <p className="text-sm text-text-muted">{category.description}</p>
                      </div>
                    </div>
                    <button
                      onClick={onClose}
                      className="text-white/70 hover:text-white transition-colors"
                    >
                      <IconX size={24} />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <p className="text-text-secondary mb-6">
                    Select a tier based on your storage capacity and needs. Higher tiers include all content from lower tiers.
                  </p>

                  <div className="space-y-4">
                    {category.tiers.map((tier) => {
                      const totalSize = getTierTotalSize(tier)
                      const isSelected = localSelectedSlug === tier.slug
                      const includedTierName = tier.includesTier
                        ? category.tiers.find(t => t.slug === tier.includesTier)?.name
                        : null
                      // Only show this tier's own resources (not inherited)
                      const ownResources = tier.resources
                      const ownResourceCount = ownResources.length

                      return (
                        <div
                          key={tier.slug}
                          onClick={() => handleTierClick(tier)}
                          className={classNames(
                            'border-2 rounded-lg p-5 cursor-pointer transition-all',
                            isSelected
                              ? 'border-desert-green bg-desert-green/5 shadow-md'
                              : 'border-border-subtle hover:border-desert-green/50 hover:shadow-sm'
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-lg font-semibold text-text-primary">
                                  {tier.name}
                                </h3>
                                {includedTierName && (
                                  <span className="text-xs text-text-muted">
                                    (includes {includedTierName})
                                  </span>
                                )}
                              </div>
                              <p className="text-text-secondary text-sm mb-3">{tier.description}</p>

                              {/* Resources preview - only show this tier's own resources */}
                              <div className="bg-surface-secondary rounded p-3">
                                <p className="text-xs text-text-muted mb-2 font-medium">
                                  {includedTierName ? (
                                    <>
                                      {ownResourceCount} additional {ownResourceCount === 1 ? 'resource' : 'resources'}
                                      <span className="text-text-muted"> (plus everything in {includedTierName})</span>
                                    </>
                                  ) : (
                                    <>{ownResourceCount} {ownResourceCount === 1 ? 'resource' : 'resources'} included</>
                                  )}
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {ownResources.map((resource, idx) => (
                                    <div key={idx} className="flex items-start text-sm">
                                      <IconCheck size={14} className="text-desert-green mr-1.5 mt-0.5 flex-shrink-0" />
                                      <div>
                                        <span className="text-text-primary">{resource.title}</span>
                                        <span className="text-text-muted text-xs ml-1">
                                          ({formatBytes(resource.size_mb * 1024 * 1024, 0)})
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="ml-4 text-right flex-shrink-0">
                              <div className="text-lg font-semibold text-text-primary">
                                {formatBytes(totalSize, 1)}
                              </div>
                              <div className={classNames(
                                'w-6 h-6 rounded-full border-2 flex items-center justify-center mt-2 ml-auto',
                                isSelected
                                  ? 'border-desert-green bg-desert-green'
                                  : 'border-border-default'
                              )}>
                                {isSelected && <IconCheck size={16} className="text-white" />}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Embedding-cost preview — visible whenever a tier is
                      selected. The estimate uses #891's ratio registry to
                      project how much extra disk space the AI Assistant will
                      need for these files on top of the raw downloads. */}
                  {localSelectedSlug && embedEstimate && embedEstimate.totalBytes > 0 && (
                    <div className="mt-4 bg-surface-secondary border border-border-subtle rounded p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <DynamicIcon icon="IconBrain" className="w-5 h-5 text-desert-green flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-text-primary">
                            <span className="font-medium">+~{formatBytes(embedEstimate.totalBytes, 1)}</span>
                            {' '}of additional storage if these are indexed for the AI Assistant
                            {embedEstimate.hasUnknown && (
                              <span className="text-text-muted"> (estimate excludes some files we have no prior data for)</span>
                            )}
                            .
                          </p>
                          <p className="text-text-muted text-xs mt-1">
                            {ingestPolicy === 'Always' ? (
                              <>
                                Your <strong>Auto-index</strong> setting is <strong>Always</strong>, so these files will be indexed automatically once downloaded. You can change this in the Knowledge Base settings.
                              </>
                            ) : (
                              <>
                                Your <strong>Auto-index</strong> setting is <strong>Manual</strong>, so these files will sit unindexed until you opt in from the Knowledge Base settings.
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Info note */}
                  <div className="mt-4 flex items-start gap-2 text-sm text-text-muted bg-blue-50 p-3 rounded">
                    <IconInfoCircle size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <p>
                      You can change your selection at any time. Click Submit to confirm your choice.
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-surface-secondary px-6 py-4 flex justify-end gap-3">
                  <StyledButton
                    variant='primary'
                    size='lg'
                    onClick={handleSubmit}
                    disabled={!localSelectedSlug || (embedEstimateRequest.length > 0 && isEstimating)}
                  >
                    Submit
                  </StyledButton>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
    {guardrailVerdict && (
      <KbGuardrailModal
        isOpen={true}
        verdict={guardrailVerdict}
        onConfirm={() => {
          setGuardrailVerdict(null)
          finalizeSubmit()
        }}
        onCancel={() => setGuardrailVerdict(null)}
      />
    )}
    </>
  )
}

export default TierSelectionModal
