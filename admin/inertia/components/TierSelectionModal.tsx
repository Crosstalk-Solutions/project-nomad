import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { IconX, IconCheck, IconInfoCircle } from '@tabler/icons-react'
import { CuratedCategory, CategoryTier, CategoryResource } from '../../types/downloads'
import { formatBytes } from '~/lib/util'
import classNames from 'classnames'
import DynamicIcon, { DynamicIconName } from './DynamicIcon'

interface TierSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  category: CuratedCategory | null
  selectedTierSlug?: string | null
  onSelectTier: (category: CuratedCategory, tier: CategoryTier) => void
}

const TierSelectionModal: React.FC<TierSelectionModalProps> = ({
  isOpen,
  onClose,
  category,
  selectedTierSlug,
  onSelectTier,
}) => {
  if (!category) return null

  // Get all resources for a tier (including inherited resources)
  const getAllResourcesForTier = (tier: CategoryTier): CategoryResource[] => {
    const resources = [...tier.resources]

    if (tier.includesTier) {
      const includedTier = category.tiers.find(t => t.slug === tier.includesTier)
      if (includedTier) {
        resources.unshift(...getAllResourcesForTier(includedTier))
      }
    }

    return resources
  }

  const getTierTotalSize = (tier: CategoryTier): number => {
    return getAllResourcesForTier(tier).reduce((acc, r) => acc + r.size_mb * 1024 * 1024, 0)
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
                    {category.tiers.map((tier, index) => {
                      const allResources = getAllResourcesForTier(tier)
                      const totalSize = getTierTotalSize(tier)
                      const isSelected = selectedTierSlug === tier.slug

                      return (
                        <div
                          key={tier.slug}
                          onClick={() => onSelectTier(category, tier)}
                          className={classNames(
                            'border-2 rounded-lg p-5 cursor-pointer transition-all',
                            isSelected
                              ? 'border-desert-green bg-desert-green/5 shadow-md'
                              : 'border-gray-200 hover:border-desert-green/50 hover:shadow-sm',
                            tier.recommended && !isSelected && 'border-lime-500/50'
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-lg font-semibold text-gray-900">
                                  {tier.name}
                                </h3>
                                {tier.recommended && (
                                  <span className="text-xs bg-lime-500 text-white px-2 py-0.5 rounded">
                                    Recommended
                                  </span>
                                )}
                                {tier.includesTier && (
                                  <span className="text-xs text-gray-500">
                                    (includes {category.tiers.find(t => t.slug === tier.includesTier)?.name})
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-600 text-sm mb-3">{tier.description}</p>

                              {/* Resources preview */}
                              <div className="bg-gray-50 rounded p-3">
                                <p className="text-xs text-gray-500 mb-2 font-medium">
                                  {allResources.length} resources included:
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {allResources.map((resource, idx) => (
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
                      You can change your selection at any time. Downloads will begin when you complete the setup wizard.
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    Close
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
