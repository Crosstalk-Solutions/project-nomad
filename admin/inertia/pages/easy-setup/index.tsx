import { Head, router } from '@inertiajs/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, useMemo } from 'react'
import AppLayout from '~/layouts/AppLayout'
import StyledButton from '~/components/StyledButton'
import api from '~/lib/api'
import { ServiceSlim } from '../../../types/services'
import CuratedCollectionCard from '~/components/CuratedCollectionCard'
import CategoryCard from '~/components/CategoryCard'
import TierSelectionModal from '~/components/TierSelectionModal'
import WikipediaSelector from '~/components/WikipediaSelector'
import LoadingSpinner from '~/components/LoadingSpinner'
import Alert from '~/components/Alert'
import { IconCheck, IconChevronDown, IconChevronUp, IconCpu, IconBooks } from '@tabler/icons-react'
import StorageProjectionBar from '~/components/StorageProjectionBar'
import { useNotifications } from '~/context/NotificationContext'
import useInternetStatus from '~/hooks/useInternetStatus'
import { useSystemInfo } from '~/hooks/useSystemInfo'
import classNames from 'classnames'
import type { CategoryWithStatus, SpecTier, SpecResource } from '../../../types/collections'
import { resolveTierResources } from '~/lib/collections'
import { SERVICE_NAMES } from '../../../constants/service_names'

// Capability definitions - maps user-friendly categories to services
interface Capability {
  id: string
  name: string
  technicalName: string
  description: string
  features: string[]
  services: string[] // service_name values that this capability installs
  icon: string
}

const CORE_CAPABILITIES: Capability[] = [
  {
    id: 'information',
    name: 'Information Library',
    technicalName: 'Kiwix',
    description:
      'Offline access to Wikipedia, medical references, how-to guides, and encyclopedias',
    features: [
      'Complete Wikipedia offline',
      'Medical references and first aid guides',
      'WikiHow articles and tutorials',
      'Project Gutenberg books and literature',
    ],
    services: [SERVICE_NAMES.KIWIX],
    icon: 'IconBooks',
  },
  {
    id: 'education',
    name: 'Education Platform',
    technicalName: 'Kolibri',
    description: 'Interactive learning platform with video courses and exercises',
    features: [
      'Khan Academy math and science courses',
      'K-12 curriculum content',
      'Interactive exercises and quizzes',
      'Progress tracking for learners',
    ],
    services: [SERVICE_NAMES.KOLIBRI],
    icon: 'IconSchool',
  },
  {
    id: 'ai',
    name: 'AI Assistant',
    technicalName: 'Ollama',
    description: 'Local AI chat that runs entirely on your hardware - no internet required',
    features: [
      'Private conversations that never leave your device',
      'No internet connection needed after setup',
      'Ask questions, get help with writing, brainstorm ideas',
      'Runs on your own hardware with local AI models',
    ],
    services: [SERVICE_NAMES.OLLAMA],
    icon: 'IconRobot',
  },
]

const ADDITIONAL_TOOLS: Capability[] = [
  {
    id: 'notes',
    name: 'Notes',
    technicalName: 'FlatNotes',
    description: 'Simple note-taking app with local storage',
    features: ['Markdown support', 'All notes stored locally', 'No account required'],
    services: [SERVICE_NAMES.FLATNOTES],
    icon: 'IconNotes',
  },
  {
    id: 'datatools',
    name: 'Data Tools',
    technicalName: 'CyberChef',
    description: 'Swiss Army knife for data encoding, encryption, and analysis',
    features: [
      'Encode/decode data (Base64, hex, etc.)',
      'Encryption and hashing tools',
      'Data format conversion',
    ],
    services: [SERVICE_NAMES.CYBERCHEF],
    icon: 'IconChefHat',
  },
]

type WizardStep = 1 | 2 | 3 | 4

const CURATED_MAP_COLLECTIONS_KEY = 'curated-map-collections'
const CURATED_CATEGORIES_KEY = 'curated-categories'
const WIKIPEDIA_STATE_KEY = 'wikipedia-state'

export default function EasySetupWizard(props: { system: { services: ServiceSlim[] } }) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [selectedMapCollections, setSelectedMapCollections] = useState<string[]>([])
  const [selectedAiModels, setSelectedAiModels] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [showAdditionalTools, setShowAdditionalTools] = useState(false)

  // Category/tier selection state
  const [selectedTiers, setSelectedTiers] = useState<Map<string, SpecTier>>(new Map())
  const [tierModalOpen, setTierModalOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryWithStatus | null>(null)

  // Wikipedia selection state
  const [selectedWikipedia, setSelectedWikipedia] = useState<string | null>(null)

  const { addNotification } = useNotifications()
  const { isOnline } = useInternetStatus()
  const queryClient = useQueryClient()
  const { data: systemInfo } = useSystemInfo({ enabled: true })

  const anySelectionMade =
    selectedServices.length > 0 ||
    selectedMapCollections.length > 0 ||
    selectedTiers.size > 0 ||
    selectedAiModels.length > 0 ||
    (selectedWikipedia !== null && selectedWikipedia !== 'none')

  const { data: mapCollections, isLoading: isLoadingMaps } = useQuery({
    queryKey: [CURATED_MAP_COLLECTIONS_KEY],
    queryFn: () => api.listCuratedMapCollections(),
    refetchOnWindowFocus: false,
  })

  // Fetch curated categories with tiers
  const { data: categories, isLoading: isLoadingCategories } = useQuery({
    queryKey: [CURATED_CATEGORIES_KEY],
    queryFn: () => api.listCuratedCategories(),
    refetchOnWindowFocus: false,
  })

  const { data: recommendedModels, isLoading: isLoadingRecommendedModels } = useQuery({
    queryKey: ['recommended-ollama-models'],
    queryFn: async () => {
      const res = await api.getAvailableModels({ recommendedOnly: true })
      if (!res) {
        return []
      }
      return res.models
    },
    refetchOnWindowFocus: false,
  })

  // Fetch Wikipedia options and current state
  const { data: wikipediaState, isLoading: isLoadingWikipedia } = useQuery({
    queryKey: [WIKIPEDIA_STATE_KEY],
    queryFn: () => api.getWikipediaState(),
    refetchOnWindowFocus: false,
  })

  // All services for display purposes
  const allServices = props.system.services

  const availableServices = props.system.services.filter(
    (service) => !service.installed && service.installation_status !== 'installing'
  )

  // Services that are already installed
  const installedServices = props.system.services.filter((service) => service.installed)

  const toggleMapCollection = (slug: string) => {
    setSelectedMapCollections((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  const toggleAiModel = (modelName: string) => {
    setSelectedAiModels((prev) =>
      prev.includes(modelName) ? prev.filter((m) => m !== modelName) : [...prev, modelName]
    )
  }

  // Category/tier handlers
  const handleCategoryClick = (category: CategoryWithStatus) => {
    if (!isOnline) return
    setActiveCategory(category)
    setTierModalOpen(true)
  }

  const handleTierSelect = (category: CategoryWithStatus, tier: SpecTier) => {
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

  // Get all resources from selected tiers for storage projection
  const getSelectedTierResources = (): SpecResource[] => {
    if (!categories) return []
    const resources: SpecResource[] = []
    selectedTiers.forEach((tier, categorySlug) => {
      const category = categories.find((c) => c.slug === categorySlug)
      if (category) {
        resources.push(...resolveTierResources(tier, category.tiers))
      }
    })
    return resources
  }

  // Calculate total projected storage from all selections
  const projectedStorageBytes = useMemo(() => {
    let totalBytes = 0

    // Add tier resources
    const tierResources = getSelectedTierResources()
    totalBytes += tierResources.reduce((sum, r) => sum + (r.size_mb ?? 0) * 1024 * 1024, 0)

    // Add map collections
    if (mapCollections) {
      selectedMapCollections.forEach((slug) => {
        const collection = mapCollections.find((c) => c.slug === slug)
        if (collection) {
          totalBytes += collection.resources.reduce((sum, r) => sum + r.size_mb * 1024 * 1024, 0)
        }
      })
    }

    // Add AI models
    if (recommendedModels) {
      selectedAiModels.forEach((modelName) => {
        const model = recommendedModels.find((m) => m.name === modelName)
        if (model?.tags?.[0]?.size) {
          // Parse size string like "4.7GB" or "1.5GB"
          const sizeStr = model.tags[0].size
          const match = sizeStr.match(/^([\d.]+)\s*(GB|MB|KB)?$/i)
          if (match) {
            const value = parseFloat(match[1])
            const unit = (match[2] || 'GB').toUpperCase()
            if (unit === 'GB') {
              totalBytes += value * 1024 * 1024 * 1024
            } else if (unit === 'MB') {
              totalBytes += value * 1024 * 1024
            } else if (unit === 'KB') {
              totalBytes += value * 1024
            }
          }
        }
      })
    }

    // Add Wikipedia selection
    if (selectedWikipedia && wikipediaState) {
      const option = wikipediaState.options.find((o) => o.id === selectedWikipedia)
      if (option && option.size_mb > 0) {
        totalBytes += option.size_mb * 1024 * 1024
      }
    }

    return totalBytes
  }, [
    selectedTiers,
    selectedMapCollections,
    selectedAiModels,
    selectedWikipedia,
    categories,
    mapCollections,
    recommendedModels,
    wikipediaState,
  ])

  // Get primary disk/filesystem info for storage projection
  // Try disk array first (Linux/production), fall back to fsSize (Windows/dev)
  // Filter out invalid disks (totalSize === 0) and prefer disk with root mount or largest valid disk
  const getPrimaryDisk = () => {
    if (!systemInfo?.disk || systemInfo.disk.length === 0) return null

    // Filter to only valid disks with actual storage
    const validDisks = systemInfo.disk.filter((d) => d.totalSize > 0)
    if (validDisks.length === 0) return null

    // Prefer disk containing root mount (/) or /storage mount
    const diskWithRoot = validDisks.find((d) =>
      d.filesystems?.some((fs) => fs.mount === '/' || fs.mount === '/storage')
    )
    if (diskWithRoot) return diskWithRoot

    // Fall back to largest valid disk
    return validDisks.reduce((largest, current) =>
      current.totalSize > largest.totalSize ? current : largest
    )
  }

  const primaryDisk = getPrimaryDisk()
  const primaryFs = systemInfo?.fsSize?.[0]
  const storageInfo = primaryDisk
    ? { totalSize: primaryDisk.totalSize, totalUsed: primaryDisk.totalUsed }
    : primaryFs
      ? { totalSize: primaryFs.size, totalUsed: primaryFs.used }
      : null

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

      // Download collections, category tiers, and AI models
      const categoryTierPromises: Promise<any>[] = []
      selectedTiers.forEach((tier, categorySlug) => {
        categoryTierPromises.push(api.downloadCategoryTier(categorySlug, tier.slug))
      })

      const downloadPromises = [
        ...selectedMapCollections.map((slug) => api.downloadMapCollection(slug)),
        ...categoryTierPromises,
        ...selectedAiModels.map((modelName) => api.downloadModel(modelName)),
      ]

      await Promise.all(downloadPromises)

      // Select Wikipedia option if one was chosen
      if (selectedWikipedia && selectedWikipedia !== wikipediaState?.currentSelection?.optionId) {
        await api.selectWikipedia(selectedWikipedia)
      }

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

  const refreshManifests = useMutation({
    mutationFn: () => api.refreshManifests(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CURATED_MAP_COLLECTIONS_KEY] })
      queryClient.invalidateQueries({ queryKey: [CURATED_CATEGORIES_KEY] })
    },
  })

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentStep])

  // Refresh manifests on mount to ensure we have latest data
  useEffect(() => {
    if (!refreshManifests.isPending) {
      refreshManifests.mutate()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Set Easy Setup as visited when user lands on this page
  useEffect(() => {
    const markAsVisited = async () => {
      try {
        await api.updateSetting('ui.hasVisitedEasySetup', 'true')
      } catch (error) {
        // Silent fail - this is non-critical
        console.warn('Failed to mark Easy Setup as visited:', error)
      }
    }

    markAsVisited()
  }, [])

  const renderStepIndicator = () => {
    const steps = [
      { number: 1, label: 'Apps' },
      { number: 2, label: 'Maps' },
      { number: 3, label: 'Content' },
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

  // Check if a capability is selected (all its services are in selectedServices)
  const isCapabilitySelected = (capability: Capability) => {
    return capability.services.every((service) => selectedServices.includes(service))
  }

  // Check if a capability is already installed (all its services are installed)
  const isCapabilityInstalled = (capability: Capability) => {
    return capability.services.every((service) =>
      installedServices.some((s) => s.service_name === service)
    )
  }

  // Check if a capability exists in the system (has at least one matching service)
  const capabilityExists = (capability: Capability) => {
    return capability.services.some((service) =>
      allServices.some((s) => s.service_name === service)
    )
  }

  // Toggle all services for a capability (only if not already installed)
  const toggleCapability = (capability: Capability) => {
    // Don't allow toggling installed capabilities
    if (isCapabilityInstalled(capability)) return

    const isSelected = isCapabilitySelected(capability)
    if (isSelected) {
      // Deselect all services in this capability
      setSelectedServices((prev) => prev.filter((s) => !capability.services.includes(s)))
    } else {
      // Select all available services in this capability
      const servicesToAdd = capability.services.filter((service) =>
        availableServices.some((s) => s.service_name === service)
      )
      setSelectedServices((prev) => [...new Set([...prev, ...servicesToAdd])])
    }
  }

  const renderCapabilityCard = (capability: Capability, isCore: boolean = true) => {
    const selected = isCapabilitySelected(capability)
    const installed = isCapabilityInstalled(capability)
    const exists = capabilityExists(capability)

    if (!exists) return null

    // Determine visual state: installed (locked), selected (user chose it), or default
    const isChecked = installed || selected

    return (
      <div
        key={capability.id}
        onClick={() => toggleCapability(capability)}
        className={classNames(
          'p-6 rounded-lg border-2 transition-all',
          installed
            ? 'border-desert-green bg-desert-green/20 cursor-default'
            : selected
              ? 'border-desert-green bg-desert-green shadow-md cursor-pointer'
              : 'border-desert-stone-light bg-white hover:border-desert-green hover:shadow-sm cursor-pointer'
        )}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3
                className={classNames(
                  'text-xl font-bold',
                  installed ? 'text-gray-700' : selected ? 'text-white' : 'text-gray-900'
                )}
              >
                {capability.name}
              </h3>
              {installed && (
                <span className="text-xs bg-desert-green text-white px-2 py-0.5 rounded-full">
                  Installed
                </span>
              )}
            </div>
            <p
              className={classNames(
                'text-sm mt-0.5',
                installed ? 'text-gray-500' : selected ? 'text-green-100' : 'text-gray-500'
              )}
            >
              Powered by {capability.technicalName}
            </p>
            <p
              className={classNames(
                'text-sm mt-3',
                installed ? 'text-gray-600' : selected ? 'text-white' : 'text-gray-600'
              )}
            >
              {capability.description}
            </p>
            {isCore && (
              <ul
                className={classNames(
                  'mt-3 space-y-1',
                  installed ? 'text-gray-600' : selected ? 'text-white' : 'text-gray-600'
                )}
              >
                {capability.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start text-sm">
                    <span
                      className={classNames(
                        'mr-2',
                        installed
                          ? 'text-desert-green'
                          : selected
                            ? 'text-white'
                            : 'text-desert-green'
                      )}
                    >
                      •
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div
            className={classNames(
              'ml-4 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
              isChecked
                ? installed
                  ? 'border-desert-green bg-desert-green'
                  : 'border-white bg-white'
                : 'border-desert-stone'
            )}
          >
            {isChecked && (
              <IconCheck size={20} className={installed ? 'text-white' : 'text-desert-green'} />
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderStep1 = () => {
    // Show all capabilities that exist in the system (including installed ones)
    const existingCoreCapabilities = CORE_CAPABILITIES.filter(capabilityExists)
    const existingAdditionalTools = ADDITIONAL_TOOLS.filter(capabilityExists)

    // Check if ALL capabilities are already installed (nothing left to install)
    const allCoreInstalled = existingCoreCapabilities.every(isCapabilityInstalled)
    const allAdditionalInstalled = existingAdditionalTools.every(isCapabilityInstalled)
    const allInstalled =
      allCoreInstalled && allAdditionalInstalled && existingCoreCapabilities.length > 0

    return (
      <div className="space-y-8">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">What do you want NOMAD to do?</h2>
          <p className="text-gray-600">
            Select the capabilities you need. You can always add more later.
          </p>
        </div>

        {allInstalled ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">
              All available capabilities are already installed!
            </p>
            <StyledButton
              variant="primary"
              className="mt-4"
              onClick={() => router.visit('/settings/apps')}
            >
              Manage Apps
            </StyledButton>
          </div>
        ) : (
          <>
            {/* Core Capabilities */}
            {existingCoreCapabilities.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Core Capabilities</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {existingCoreCapabilities.map((capability) =>
                    renderCapabilityCard(capability, true)
                  )}
                </div>
              </div>
            )}

            {/* Additional Tools - Collapsible */}
            {existingAdditionalTools.length > 0 && (
              <div className="border-t border-desert-stone-light pt-6">
                <button
                  onClick={() => setShowAdditionalTools(!showAdditionalTools)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h3 className="text-md font-medium text-gray-500">Additional Tools</h3>
                  {showAdditionalTools ? (
                    <IconChevronUp size={20} className="text-gray-400" />
                  ) : (
                    <IconChevronDown size={20} className="text-gray-400" />
                  )}
                </button>
                {showAdditionalTools && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {existingAdditionalTools.map((capability) =>
                      renderCapabilityCard(capability, false)
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

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
                isOnline && !collection.all_installed && toggleMapCollection(collection.slug)
              }
              className={classNames(
                'relative',
                selectedMapCollections.includes(collection.slug) &&
                'ring-4 ring-desert-green rounded-lg',
                collection.all_installed && 'opacity-75',
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

  const renderStep3 = () => {
    // Check if AI or Information capabilities are selected OR already installed
    const isAiSelected = selectedServices.includes(SERVICE_NAMES.OLLAMA) ||
      installedServices.some((s) => s.service_name === SERVICE_NAMES.OLLAMA)
    const isInformationSelected = selectedServices.includes(SERVICE_NAMES.KIWIX) ||
      installedServices.some((s) => s.service_name === SERVICE_NAMES.KIWIX)

    return (
      <div className="space-y-6">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Choose Content</h2>
          <p className="text-gray-600">
            {isAiSelected && isInformationSelected
              ? 'Select AI models and content categories for offline use.'
              : isAiSelected
                ? 'Select AI models to download for offline use.'
                : isInformationSelected
                  ? 'Select content categories for offline knowledge.'
                  : 'Configure content for your selected capabilities.'}
          </p>
        </div>

        {/* AI Model Selection - Only show if AI capability is selected */}
        {isAiSelected && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                <IconCpu className="w-6 h-6 text-gray-700" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">AI Models</h3>
                <p className="text-sm text-gray-500">Select models to download for offline AI</p>
              </div>
            </div>

            {isLoadingRecommendedModels ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : recommendedModels && recommendedModels.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendedModels.map((model) => (
                  <div
                    key={model.name}
                    onClick={() => isOnline && toggleAiModel(model.name)}
                    className={classNames(
                      'p-4 rounded-lg border-2 transition-all cursor-pointer',
                      selectedAiModels.includes(model.name)
                        ? 'border-desert-green bg-desert-green shadow-md'
                        : 'border-desert-stone-light bg-white hover:border-desert-green hover:shadow-sm',
                      !isOnline && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4
                          className={classNames(
                            'text-lg font-semibold mb-1',
                            selectedAiModels.includes(model.name) ? 'text-white' : 'text-gray-900'
                          )}
                        >
                          {model.name}
                        </h4>
                        <p
                          className={classNames(
                            'text-sm mb-2',
                            selectedAiModels.includes(model.name) ? 'text-white' : 'text-gray-600'
                          )}
                        >
                          {model.description}
                        </p>
                        {model.tags?.[0]?.size && (
                          <div
                            className={classNames(
                              'text-xs',
                              selectedAiModels.includes(model.name)
                                ? 'text-green-100'
                                : 'text-gray-500'
                            )}
                          >
                            Size: {model.tags[0].size}
                          </div>
                        )}
                      </div>
                      <div
                        className={classNames(
                          'ml-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
                          selectedAiModels.includes(model.name)
                            ? 'border-white bg-white'
                            : 'border-desert-stone'
                        )}
                      >
                        {selectedAiModels.includes(model.name) && (
                          <IconCheck size={16} className="text-desert-green" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <p className="text-gray-600">No recommended AI models available at this time.</p>
              </div>
            )}
          </div>
        )}

        {/* Wikipedia Selection - Only show if Information capability is selected */}
        {isInformationSelected && (
          <>
            {/* Divider between AI Models and Wikipedia */}
            {isAiSelected && <hr className="my-8 border-gray-200" />}

            <div className="mb-8">
              {isLoadingWikipedia ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : wikipediaState && wikipediaState.options.length > 0 ? (
                <WikipediaSelector
                  options={wikipediaState.options}
                  currentSelection={wikipediaState.currentSelection}
                  selectedOptionId={selectedWikipedia}
                  onSelect={(optionId) => isOnline && setSelectedWikipedia(optionId)}
                  disabled={!isOnline}
                />
              ) : null}
            </div>
          </>
        )}

        {/* Curated Categories with Tiers - Only show if Information capability is selected */}
        {isInformationSelected && (
          <>
            {/* Divider between Wikipedia and Additional Content */}
            <hr className="my-8 border-gray-200" />

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                <IconBooks className="w-6 h-6 text-gray-700" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Additional Content</h3>
                <p className="text-sm text-gray-500">Curated collections for offline reference</p>
              </div>
            </div>

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
                  selectedTierSlug={
                    activeCategory
                      ? selectedTiers.get(activeCategory.slug)?.slug || activeCategory.installedTierSlug
                      : null
                  }
                  onSelectTier={handleTierSelect}
                />
              </>
            ) : null}

          </>
        )}

        {/* Show message if no capabilities requiring content are selected */}
        {!isAiSelected && !isInformationSelected && (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">
              No content-based capabilities selected. You can skip this step or go back to select
              capabilities that require content.
            </p>
          </div>
        )}
      </div>
    )
  }

  const renderStep4 = () => {
    const hasSelections =
      selectedServices.length > 0 ||
      selectedMapCollections.length > 0 ||
      selectedTiers.size > 0 ||
      selectedAiModels.length > 0 ||
      (selectedWikipedia !== null && selectedWikipedia !== 'none')

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
                  Capabilities to Install
                </h3>
                <ul className="space-y-2">
                  {[...CORE_CAPABILITIES, ...ADDITIONAL_TOOLS]
                    .filter((cap) => cap.services.some((s) => selectedServices.includes(s)))
                    .map((capability) => (
                      <li key={capability.id} className="flex items-center">
                        <IconCheck size={20} className="text-desert-green mr-2" />
                        <span className="text-gray-700">
                          {capability.name}
                          <span className="text-gray-400 text-sm ml-2">
                            ({capability.technicalName})
                          </span>
                        </span>
                      </li>
                    ))}
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

            {selectedTiers.size > 0 && (
              <div className="bg-white rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  Content Categories ({selectedTiers.size})
                </h3>
                {Array.from(selectedTiers.entries()).map(([categorySlug, tier]) => {
                  const category = categories?.find((c) => c.slug === categorySlug)
                  if (!category) return null
                  const resources = resolveTierResources(tier, category.tiers)
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

            {selectedWikipedia && selectedWikipedia !== 'none' && (
              <div className="bg-white rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Wikipedia</h3>
                {(() => {
                  const option = wikipediaState?.options.find((o) => o.id === selectedWikipedia)
                  return option ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <IconCheck size={20} className="text-desert-green mr-2" />
                        <span className="text-gray-700">{option.name}</span>
                      </div>
                      <span className="text-gray-500 text-sm">
                        {option.size_mb > 0
                          ? `${(option.size_mb / 1024).toFixed(1)} GB`
                          : 'No download'}
                      </span>
                    </div>
                  ) : null
                })()}
              </div>
            )}

            {selectedAiModels.length > 0 && (
              <div className="bg-white rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  AI Models to Download ({selectedAiModels.length})
                </h3>
                <ul className="space-y-2">
                  {selectedAiModels.map((modelName) => {
                    const model = recommendedModels?.find((m) => m.name === modelName)
                    return (
                      <li key={modelName} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <IconCheck size={20} className="text-desert-green mr-2" />
                          <span className="text-gray-700">{modelName}</span>
                        </div>
                        {model?.tags?.[0]?.size && (
                          <span className="text-gray-500 text-sm">{model.tags[0].size}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
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
          {storageInfo && (
            <div className="px-6 pt-4">
              <StorageProjectionBar
                totalSize={storageInfo.totalSize}
                currentUsed={storageInfo.totalUsed}
                projectedAddition={projectedStorageBytes}
              />
            </div>
          )}
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
                    icon="IconChevronLeft"
                  >
                    Back
                  </StyledButton>
                )}

                <p className="text-sm text-gray-600">
                  {(() => {
                    const count = [...CORE_CAPABILITIES, ...ADDITIONAL_TOOLS].filter((cap) =>
                      cap.services.some((s) => selectedServices.includes(s))
                    ).length
                    return `${count} ${count === 1 ? 'capability' : 'capabilities'}`
                  })()}
                  , {selectedMapCollections.length} map region
                  {selectedMapCollections.length !== 1 && 's'}, {selectedTiers.size}{' '}
                  content categor{selectedTiers.size !== 1 ? 'ies' : 'y'},{' '}
                  {selectedAiModels.length} AI model{selectedAiModels.length !== 1 && 's'} selected
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
                    icon="IconChevronRight"
                  >
                    Next
                  </StyledButton>
                ) : (
                  <StyledButton
                    onClick={handleFinish}
                    disabled={isProcessing || !isOnline || !anySelectionMade}
                    loading={isProcessing}
                    variant="success"
                    icon="IconCheck"
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
