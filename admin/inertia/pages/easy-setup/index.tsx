import { Head, router } from '@inertiajs/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import AppLayout from '~/layouts/AppLayout'
import StyledButton from '~/components/StyledButton'
import api from '~/lib/api'
import { ServiceSlim } from '../../../types/services'
import CuratedCollectionCard from '~/components/CuratedCollectionCard'
import CategoryCard from '~/components/CategoryCard'
import TierSelectionModal from '~/components/TierSelectionModal'
import LoadingSpinner from '~/components/LoadingSpinner'
import Alert from '~/components/Alert'
import { IconCheck } from '@tabler/icons-react'
import { useNotifications } from '~/context/NotificationContext'
import useInternetStatus from '~/hooks/useInternetStatus'
import classNames from 'classnames'
import { CuratedCategory, CategoryTier, CategoryResource } from '../../../types/downloads'

type WizardStep = 1 | 2 | 3 | 4

const CURATED_MAP_COLLECTIONS_KEY = 'curated-map-collections'
const CURATED_ZIM_COLLECTIONS_KEY = 'curated-zim-collections'
const CURATED_CATEGORIES_KEY = 'curated-categories'
const CATEGORIES_URL =
  'https://cdn.jsdelivr.net/gh/Crosstalk-Solutions/project-nomad@feature/tiered-collections/collections/kiwix-categories.json?v=2'

// Helper to get all resources for a tier (including inherited resources)
const getAllResourcesForTier = (tier: CategoryTier, allTiers: CategoryTier[]): CategoryResource[] => {
  const resources = [...tier.resources]
  if (tier.includesTier) {
    const includedTier = allTiers.find((t) => t.slug === tier.includesTier)
    if (includedTier) {
      resources.unshift(...getAllResourcesForTier(includedTier, allTiers))
    }
  }
  return resources
}

export default function EasySetupWizard(props: { system: { services: ServiceSlim[] } }) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [selectedMapCollections, setSelectedMapCollections] = useState<string[]>([])
  const [selectedZimCollections, setSelectedZimCollections] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // Category/tier selection state
  const [selectedTiers, setSelectedTiers] = useState<Map<string, CategoryTier>>(new Map())
  const [tierModalOpen, setTierModalOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CuratedCategory | null>(null)

  const { addNotification } = useNotifications()
  const { isOnline } = useInternetStatus()
  const queryClient = useQueryClient()

  const anySelectionMade =
    selectedServices.length > 0 ||
    selectedMapCollections.length > 0 ||
    selectedZimCollections.length > 0 ||
    selectedTiers.size > 0

  const { data: mapCollections, isLoading: isLoadingMaps } = useQuery({
    queryKey: [CURATED_MAP_COLLECTIONS_KEY],
    queryFn: () => api.listCuratedMapCollections(),
    refetchOnWindowFocus: false,
  })

  const { data: zimCollections, isLoading: isLoadingZims } = useQuery({
    queryKey: [CURATED_ZIM_COLLECTIONS_KEY],
    queryFn: () => api.listCuratedZimCollections(),
    refetchOnWindowFocus: false,
  })

  // Fetch curated categories with tiers
  const { data: categories, isLoading: isLoadingCategories } = useQuery({
    queryKey: [CURATED_CATEGORIES_KEY],
    queryFn: async () => {
      const response = await fetch(CATEGORIES_URL)
      if (!response.ok) {
        throw new Error('Failed to fetch categories')
      }
      const data = await response.json()
      return data.categories as CuratedCategory[]
    },
    refetchOnWindowFocus: false,
  })

  const availableServices = props.system.services.filter(
    (service) => !service.installed && service.installation_status !== 'installing'
  )

  const toggleServiceSelection = (serviceName: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceName) ? prev.filter((s) => s !== serviceName) : [...prev, serviceName]
    )
  }

  const toggleMapCollection = (slug: string) => {
    setSelectedMapCollections((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  const toggleZimCollection = (slug: string) => {
    setSelectedZimCollections((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  // Category/tier handlers
  const handleCategoryClick = (category: CuratedCategory) => {
    if (!isOnline) return
    setActiveCategory(category)
    setTierModalOpen(true)
  }

  const handleTierSelect = (category: CuratedCategory, tier: CategoryTier) => {
    setSelectedTiers((prev) => {
      const newMap = new Map(prev)
      // If same tier is selected, deselect it
      if (prev.get(category.slug)?.slug === tier.slug) {
        newMap.delete(category.slug)
      } else {
        newMap.set(category.slug, tier)
      }
      return newMap
    })
  }

  const closeTierModal = () => {
    setTierModalOpen(false)
    setActiveCategory(null)
  }

  // Get all resources from selected tiers for downloading
  const getSelectedTierResources = (): CategoryResource[] => {
    if (!categories) return []
    const resources: CategoryResource[] = []
    selectedTiers.forEach((tier, categorySlug) => {
      const category = categories.find((c) => c.slug === categorySlug)
      if (category) {
        resources.push(...getAllResourcesForTier(tier, category.tiers))
      }
    })
    return resources
  }

  const canProceedToNextStep = () => {
    if (!isOnline) return false // Must be online to proceed
    if (currentStep === 1) return true // Can skip app installation
    if (currentStep === 2) return true // Can skip map downloads
    if (currentStep === 3) return true // Can skip ZIM downloads
    return false
  }

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => (prev + 1) as WizardStep)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as WizardStep)
    }
  }

  const handleFinish = async () => {
    if (!isOnline) {
      addNotification({
        type: 'error',
        message: 'You must have an internet connection to complete the setup.',
      })
      return
    }

    setIsProcessing(true)

    try {
      // All of these ops don't actually wait for completion, they just kick off the process, so we can run them in parallel without awaiting each one sequentially
      const installPromises = selectedServices.map((serviceName) => api.installService(serviceName))

      await Promise.all(installPromises)

      // Download collections and individual tier resources
      const tierResources = getSelectedTierResources()
      const downloadPromises = [
        ...selectedMapCollections.map((slug) => api.downloadMapCollection(slug)),
        ...selectedZimCollections.map((slug) => api.downloadZimCollection(slug)),
        ...tierResources.map((resource) => api.downloadRemoteZimFile(resource.url)),
      ]

      await Promise.all(downloadPromises)

      addNotification({
        type: 'success',
        message: 'Setup wizard completed! Your selections are being processed.',
      })

      router.visit('/easy-setup/complete')
    } catch (error) {
      console.error('Error during setup:', error)
      addNotification({
        type: 'error',
        message: 'An error occurred during setup. Some items may not have been processed.',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const fetchLatestMapCollections = useMutation({
    mutationFn: () => api.fetchLatestMapCollections(),
    onSuccess: () => {
      addNotification({
        message: 'Successfully fetched the latest map collections.',
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: [CURATED_MAP_COLLECTIONS_KEY] })
    },
  })

  const fetchLatestZIMCollections = useMutation({
    mutationFn: () => api.fetchLatestZimCollections(),
    onSuccess: () => {
      addNotification({
        message: 'Successfully fetched the latest ZIM collections.',
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: [CURATED_ZIM_COLLECTIONS_KEY] })
    },
  })

  // Auto-fetch latest collections if the list is empty
  useEffect(() => {
    if (mapCollections && mapCollections.length === 0 && !fetchLatestMapCollections.isPending) {
      fetchLatestMapCollections.mutate()
    }
  }, [mapCollections, fetchLatestMapCollections])

  useEffect(() => {
    if (zimCollections && zimCollections.length === 0 && !fetchLatestZIMCollections.isPending) {
      fetchLatestZIMCollections.mutate()
    }
  }, [zimCollections, fetchLatestZIMCollections])

  const renderStepIndicator = () => {
    const steps = [
      { number: 1, label: 'Apps' },
      { number: 2, label: 'Maps' },
      { number: 3, label: 'ZIM Files' },
      { number: 4, label: 'Review' },
    ]

    return (
      <nav aria-label="Progress" className="px-6 pt-6">
        <ol
          role="list"
          className="divide-y divide-gray-300 rounded-md md:flex md:divide-y-0 md:justify-between border border-desert-green"
        >
          {steps.map((step, stepIdx) => (
            <li key={step.number} className="relative md:flex-1 md:flex md:justify-center">
              {currentStep > step.number ? (
                <div className="group flex w-full items-center md:justify-center">
                  <span className="flex items-center px-6 py-2 text-sm font-medium">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-desert-green">
                      <IconCheck aria-hidden="true" className="size-6 text-white" />
                    </span>
                    <span className="ml-4 text-lg font-medium text-gray-900">{step.label}</span>
                  </span>
                </div>
              ) : currentStep === step.number ? (
                <div
                  aria-current="step"
                  className="flex items-center px-6 py-2 text-sm font-medium md:justify-center"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-desert-green border-2 border-desert-green">
                    <span className="text-white">{step.number}</span>
                  </span>
                  <span className="ml-4 text-lg font-medium text-desert-green">{step.label}</span>
                </div>
              ) : (
                <div className="group flex items-center md:justify-center">
                  <span className="flex items-center px-6 py-2 text-sm font-medium">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-gray-300">
                      <span className="text-gray-500">{step.number}</span>
                    </span>
                    <span className="ml-4 text-lg font-medium text-gray-500">{step.label}</span>
                  </span>
                </div>
              )}

              {stepIdx !== steps.length - 1 ? (
                <>
                  {/* Arrow separator for lg screens and up */}
                  <div
                    aria-hidden="true"
                    className="absolute top-0 right-0 hidden h-full w-5 md:block"
                  >
                    <svg
                      fill="none"
                      viewBox="0 0 22 80"
                      preserveAspectRatio="none"
                      className={`size-full ${currentStep > step.number ? 'text-desert-green' : 'text-gray-300'}`}
                    >
                      <path
                        d="M0 -2L20 40L0 82"
                        stroke="currentcolor"
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      </nav>
    )
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Choose Apps to Install</h2>
        <p className="text-gray-600">
          Select the applications you'd like to install. You can always add more later.
        </p>
      </div>
      {availableServices.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg">All available apps are already installed!</p>
          <StyledButton
            variant="primary"
            className="mt-4"
            onClick={() => router.visit('/settings/apps')}
          >
            Manage Apps
          </StyledButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableServices.map((service) => {
            const selected = selectedServices.includes(service.service_name)

            return (
              <div
                key={service.id}
                onClick={() => toggleServiceSelection(service.service_name)}
                className={classNames(
                  'p-6 rounded-lg border-2 cursor-pointer transition-all',
                  selected
                    ? 'border-desert-green bg-desert-green bg-opacity-10 shadow-md text-white'
                    : 'border-desert-stone-light bg-white hover:border-desert-green hover:shadow-sm'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">
                      {service.friendly_name || service.service_name}
                    </h3>
                    <p
                      className={classNames(
                        'text-sm mt-1',
                        selected ? 'text-white' : 'text-gray-600'
                      )}
                    >
                      {service.description}
                    </p>
                  </div>
                  <div
                    className={classNames(
                      'ml-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                      selected ? 'border-desert-green bg-desert-green' : 'border-desert-stone'
                    )}
                  >
                    {selected ? (
                      <IconCheck size={20} className="text-white" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-transparent" />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Choose Map Regions</h2>
        <p className="text-gray-600">
          Select map region collections to download for offline use. You can always download more
          regions later.
        </p>
      </div>
      {isLoadingMaps ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : mapCollections && mapCollections.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mapCollections.map((collection) => (
            <div
              key={collection.slug}
              onClick={() =>
                isOnline && !collection.all_downloaded && toggleMapCollection(collection.slug)
              }
              className={classNames(
                'relative',
                selectedMapCollections.includes(collection.slug) &&
                  'ring-4 ring-desert-green rounded-lg',
                collection.all_downloaded && 'opacity-75',
                !isOnline && 'opacity-50 cursor-not-allowed'
              )}
            >
              <CuratedCollectionCard collection={collection} />
              {selectedMapCollections.includes(collection.slug) && (
                <div className="absolute top-2 right-2 bg-desert-green rounded-full p-1">
                  <IconCheck size={32} className="text-white" />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg">No map collections available at this time.</p>
        </div>
      )}
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Choose Content Collections</h2>
        <p className="text-gray-600">
          Select content categories for offline knowledge. Click a category to choose your preferred tier based on storage capacity.
        </p>
      </div>

      {/* Curated Categories with Tiers */}
      {isLoadingCategories ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : categories && categories.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category) => (
              <CategoryCard
                key={category.slug}
                category={category}
                selectedTier={selectedTiers.get(category.slug) || null}
                onClick={handleCategoryClick}
              />
            ))}
          </div>

          {/* Tier Selection Modal */}
          <TierSelectionModal
            isOpen={tierModalOpen}
            onClose={closeTierModal}
            category={activeCategory}
            selectedTierSlug={activeCategory ? selectedTiers.get(activeCategory.slug)?.slug : null}
            onSelectTier={handleTierSelect}
          />
        </>
      ) : null}

      {/* Legacy flat collections - show if available and no categories */}
      {(!categories || categories.length === 0) && (
        <>
          {isLoadingZims ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : zimCollections && zimCollections.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {zimCollections.map((collection) => (
                <div
                  key={collection.slug}
                  onClick={() =>
                    isOnline && !collection.all_downloaded && toggleZimCollection(collection.slug)
                  }
                  className={classNames(
                    'relative',
                    selectedZimCollections.includes(collection.slug) &&
                      'ring-4 ring-desert-green rounded-lg',
                    collection.all_downloaded && 'opacity-75',
                    !isOnline && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <CuratedCollectionCard collection={collection} size="large" />
                  {selectedZimCollections.includes(collection.slug) && (
                    <div className="absolute top-2 right-2 bg-desert-green rounded-full p-1">
                      <IconCheck size={32} className="text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">No content collections available at this time.</p>
            </div>
          )}
        </>
      )}
    </div>
  )

  const renderStep4 = () => {
    const hasSelections =
      selectedServices.length > 0 ||
      selectedMapCollections.length > 0 ||
      selectedZimCollections.length > 0 ||
      selectedTiers.size > 0

    return (
      <div className="space-y-6">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Review Your Selections</h2>
          <p className="text-gray-600">Review your choices before starting the setup process.</p>
        </div>

        {!hasSelections ? (
          <Alert
            title="No Selections Made"
            message="You haven't selected anything to install or download. You can go back to make selections or go back to the home page."
            type="info"
            variant="bordered"
          />
        ) : (
          <div className="space-y-6">
            {selectedServices.length > 0 && (
              <div className="bg-white rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  Apps to Install ({selectedServices.length})
                </h3>
                <ul className="space-y-2">
                  {selectedServices.map((serviceName) => {
                    const service = availableServices.find((s) => s.service_name === serviceName)
                    return (
                      <li key={serviceName} className="flex items-center">
                        <IconCheck size={20} className="text-desert-green mr-2" />
                        <span className="text-gray-700">
                          {service?.friendly_name || serviceName}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {selectedMapCollections.length > 0 && (
              <div className="bg-white rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  Map Collections to Download ({selectedMapCollections.length})
                </h3>
                <ul className="space-y-2">
                  {selectedMapCollections.map((slug) => {
                    const collection = mapCollections?.find((c) => c.slug === slug)
                    return (
                      <li key={slug} className="flex items-center">
                        <IconCheck size={20} className="text-desert-green mr-2" />
                        <span className="text-gray-700">{collection?.name || slug}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {selectedZimCollections.length > 0 && (
              <div className="bg-white rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  ZIM Collections to Download ({selectedZimCollections.length})
                </h3>
                <ul className="space-y-2">
                  {selectedZimCollections.map((slug) => {
                    const collection = zimCollections?.find((c) => c.slug === slug)
                    return (
                      <li key={slug} className="flex items-center">
                        <IconCheck size={20} className="text-desert-green mr-2" />
                        <span className="text-gray-700">{collection?.name || slug}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {selectedTiers.size > 0 && (
              <div className="bg-white rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  Content Categories ({selectedTiers.size})
                </h3>
                {Array.from(selectedTiers.entries()).map(([categorySlug, tier]) => {
                  const category = categories?.find((c) => c.slug === categorySlug)
                  if (!category) return null
                  const resources = getAllResourcesForTier(tier, category.tiers)
                  return (
                    <div key={categorySlug} className="mb-4 last:mb-0">
                      <div className="flex items-center mb-2">
                        <IconCheck size={20} className="text-desert-green mr-2" />
                        <span className="text-gray-900 font-medium">
                          {category.name} - {tier.name}
                        </span>
                        <span className="text-gray-500 text-sm ml-2">
                          ({resources.length} files)
                        </span>
                      </div>
                      <ul className="ml-7 space-y-1">
                        {resources.map((resource, idx) => (
                          <li key={idx} className="text-sm text-gray-600">
                            {resource.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}

            <Alert
              title="Ready to Start"
              message="Click 'Complete Setup' to begin installing apps and downloading content. This may take some time depending on your internet connection and the size of the downloads."
              type="info"
              variant="solid"
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <AppLayout>
      <Head title="Easy Setup Wizard" />
      {!isOnline && (
        <Alert
          title="No Internet Connection"
          message="You'll need an internet connection to proceed. Please connect to the internet and try again."
          type="warning"
          variant="solid"
          className="mb-8"
        />
      )}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-md shadow-md">
          {renderStepIndicator()}
          <div className="p-6 min-h-fit">
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}

            <div className="flex justify-between mt-8 pt-4 border-t border-desert-stone-light">
              <div className="flex space-x-4 items-center">
                {currentStep > 1 && (
                  <StyledButton
                    onClick={handleBack}
                    disabled={isProcessing}
                    variant="outline"
                    icon="ChevronLeftIcon"
                  >
                    Back
                  </StyledButton>
                )}

                <p className="text-sm text-gray-600">
                  {selectedServices.length} app{selectedServices.length !== 1 && 's'},{' '}
                  {selectedMapCollections.length} map collection
                  {selectedMapCollections.length !== 1 && 's'}, {selectedZimCollections.length} ZIM
                  collection{selectedZimCollections.length !== 1 && 's'} selected
                </p>
              </div>

              <div className="flex space-x-4">
                <StyledButton
                  onClick={() => router.visit('/home')}
                  disabled={isProcessing}
                  variant="outline"
                >
                  Cancel & Go to Home
                </StyledButton>

                {currentStep < 4 ? (
                  <StyledButton
                    onClick={handleNext}
                    disabled={!canProceedToNextStep() || isProcessing}
                    variant="primary"
                    icon="ChevronRightIcon"
                  >
                    Next
                  </StyledButton>
                ) : (
                  <StyledButton
                    onClick={handleFinish}
                    disabled={isProcessing || !isOnline || !anySelectionMade}
                    loading={isProcessing}
                    variant="success"
                    icon="CheckIcon"
                  >
                    Complete Setup
                  </StyledButton>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
