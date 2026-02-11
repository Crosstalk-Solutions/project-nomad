import { Fragment, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { IconX, IconCheck, IconInfoCircle } from '@tabler/icons-react'
import type { CategoryWithStatus, SpecTier, SpecResource } from '../../types/collections'
import { resolveTierResources } from '~/lib/collections'
import { formatBytes } from '~/lib/util'
import classNames from 'classnames'
import DynamicIcon, { DynamicIconName } from './DynamicIcon'

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

  if (!category) return null

  // Get all resources for a tier (including inherited resources)
  const getAllResourcesForTier = (tier: SpecTier): SpecResource[] => {
    return resolveTierResources(tier, category.tiers)
  }

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

  const handleSubmit = () => {
    if (!localSelectedSlug) return

    const selectedTier = category.tiers.find(t => t.slug === localSelectedSlug)
    if (selectedTier) {
      onSelectTier(category, selectedTier)
    }
    onClose()
  }

  return (
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
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
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
                        <p className="text-sm text-gray-200">{category.description}</p>
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
                  <p className="text-gray-600 mb-6">
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
                              : 'border-gray-200 hover:border-desert-green/50 hover:shadow-sm'
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-lg font-semibold text-gray-900">
                                  {tier.name}
                                </h3>
                                {includedTierName && (
                                  <span className="text-xs text-gray-500">
                                    (includes {includedTierName})
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-600 text-sm mb-3">{tier.description}</p>

                              {/* Resources preview - only show this tier's own resources */}
                              <div className="bg-gray-50 rounded p-3">
                                <p className="text-xs text-gray-500 mb-2 font-medium">
                                  {includedTierName ? (
                                    <>
                                      {ownResourceCount} additional {ownResourceCount === 1 ? 'resource' : 'resources'}
                                      <span className="text-gray-400"> (plus everything in {includedTierName})</span>
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
                                        <span className="text-gray-700">{resource.title}</span>
                                        <span className="text-gray-400 text-xs ml-1">
                                          ({formatBytes(resource.size_mb * 1024 * 1024, 0)})
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="ml-4 text-right flex-shrink-0">
                              <div className="text-lg font-semibold text-gray-900">
                                {formatBytes(totalSize, 1)}
                              </div>
                              <div className={classNames(
                                'w-6 h-6 rounded-full border-2 flex items-center justify-center mt-2 ml-auto',
                                isSelected
                                  ? 'border-desert-green bg-desert-green'
                                  : 'border-gray-300'
                              )}>
                                {isSelected && <IconCheck size={16} className="text-white" />}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Info note */}
                  <div className="mt-6 flex items-start gap-2 text-sm text-gray-500 bg-blue-50 p-3 rounded">
                    <IconInfoCircle size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <p>
                      You can change your selection at any time. Click Submit to confirm your choice.
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                  <button
                    onClick={handleSubmit}
                    disabled={!localSelectedSlug}
                    className={classNames(
                      'px-4 py-2 rounded-md font-medium transition-colors',
                      localSelectedSlug
                        ? 'bg-desert-green text-white hover:bg-desert-green/90'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    )}
                  >
                    Submit
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

export default TierSelectionModal
