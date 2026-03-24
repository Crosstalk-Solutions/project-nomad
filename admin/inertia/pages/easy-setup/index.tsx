import { Head, router, usePage } from '@inertiajs/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
import { getPrimaryDiskInfo } from '~/hooks/useDiskDisplayData'
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

function buildCoreCapabilities(aiAssistantName: string, t: (key: string) => string): Capability[] {
  return [
    {
      id: 'information',
      name: t('easySetup.capabilities.information.name'),
      technicalName: 'Kiwix',
      description:
        t('easySetup.capabilities.information.description'),
      features: [
        t('easySetup.capabilities.information.features.wikipedia'),
        t('easySetup.capabilities.information.features.medical'),
        t('easySetup.capabilities.information.features.diy'),
        t('easySetup.capabilities.information.features.gutenberg'),
      ],
      services: [SERVICE_NAMES.KIWIX],
      icon: 'IconBooks',
    },
    {
      id: 'education',
      name: t('easySetup.capabilities.education.name'),
      technicalName: 'Kolibri',
      description: t('easySetup.capabilities.education.description'),
      features: [
        t('easySetup.capabilities.education.features.khan'),
        t('easySetup.capabilities.education.features.k12'),
        t('easySetup.capabilities.education.features.exercises'),
        t('easySetup.capabilities.education.features.progress'),
      ],
      services: [SERVICE_NAMES.KOLIBRI],
      icon: 'IconSchool',
    },
    {
      id: 'ai',
      name: aiAssistantName,
      technicalName: 'Ollama',
      description: t('easySetup.capabilities.ai.description'),
      features: [
        t('easySetup.capabilities.ai.features.private'),
        t('easySetup.capabilities.ai.features.offline'),
        t('easySetup.capabilities.ai.features.questions'),
        t('easySetup.capabilities.ai.features.local'),
      ],
      services: [SERVICE_NAMES.OLLAMA],
      icon: 'IconRobot',
    },
  ]
}

function buildAdditionalTools(t: (key: string) => string): Capability[] {
  return [
    {
      id: 'notes',
      name: t('easySetup.capabilities.notes.name'),
      technicalName: 'FlatNotes',
      description: t('easySetup.capabilities.notes.description'),
      features: [t('easySetup.capabilities.notes.features.markdown'), t('easySetup.capabilities.notes.features.local'), t('easySetup.capabilities.notes.features.noAccount')],
      services: [SERVICE_NAMES.FLATNOTES],
      icon: 'IconNotes',
    },
    {
      id: 'datatools',
      name: t('easySetup.capabilities.datatools.name'),
      technicalName: 'CyberChef',
      description: t('easySetup.capabilities.datatools.description'),
      features: [
        t('easySetup.capabilities.datatools.features.encode'),
        t('easySetup.capabilities.datatools.features.encryption'),
        t('easySetup.capabilities.datatools.features.conversion'),
      ],
      services: [SERVICE_NAMES.CYBERCHEF],
      icon: 'IconChefHat',
    },
  ]
}

type WizardStep = 1 | 2 | 3 | 4

const CURATED_MAP_COLLECTIONS_KEY = 'curated-map-collections'
const CURATED_CATEGORIES_KEY = 'curated-categories'
const WIKIPEDIA_STATE_KEY = 'wikipedia-state'

export default function EasySetupWizard(props: { system: { services: ServiceSlim[] } }) {
  const { t } = useTranslation()
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const CORE_CAPABILITIES = buildCoreCapabilities(aiAssistantName, t)
  const ADDITIONAL_TOOLS = buildAdditionalTools(t)

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
  const storageInfo = getPrimaryDiskInfo(systemInfo?.disk, systemInfo?.fsSize)

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
        message: t('easySetup.noInternetSetup'),
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
        message: t('easySetup.setupComplete'),
      })

      router.visit('/easy-setup/complete')
    } catch (error) {
      console.error('Error during setup:', error)
      addNotification({
        type: 'error',
        message: t('easySetup.setupError'),
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
      { number: 1, label: t('easySetup.steps.apps') },
      { number: 2, label: t('easySetup.steps.maps') },
      { number: 3, label: t('easySetup.steps.content') },
      { number: 4, label: t('easySetup.steps.review') },
    ]

    return (
      <nav aria-label="Progress" className="px-6 pt-6">
        <ol
          role="list"
          className="divide-y divide-border-default rounded-md md:flex md:divide-y-0 md:justify-between border border-desert-green"
        >
          {steps.map((step, stepIdx) => (
            <li key={step.number} className="relative md:flex-1 md:flex md:justify-center">
              {currentStep > step.number ? (
                <div className="group flex w-full items-center md:justify-center">
                  <span className="flex items-center px-6 py-2 text-sm font-medium">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-desert-green">
                      <IconCheck aria-hidden="true" className="size-6 text-white" />
                    </span>
                    <span className="ml-4 text-lg font-medium text-text-primary">{step.label}</span>
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
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-border-default">
                      <span className="text-text-muted">{step.number}</span>
                    </span>
                    <span className="ml-4 text-lg font-medium text-text-muted">{step.label}</span>
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
                      className={`size-full ${currentStep > step.number ? 'text-desert-green' : 'text-text-muted'}`}
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
              : 'border-desert-stone-light bg-surface-primary hover:border-desert-green hover:shadow-sm cursor-pointer'
        )}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3
                className={classNames(
                  'text-xl font-bold',
                  installed ? 'text-text-primary' : selected ? 'text-white' : 'text-text-primary'
                )}
              >
                {capability.name}
              </h3>
              {installed && (
                <span className="text-xs bg-desert-green text-white px-2 py-0.5 rounded-full">
                  {t('easySetup.installed')}
                </span>
              )}
            </div>
            <p
              className={classNames(
                'text-sm mt-0.5',
                installed ? 'text-text-muted' : selected ? 'text-green-100' : 'text-text-muted'
              )}
            >
              {t('home.poweredBy', { name: capability.technicalName })}
            </p>
            <p
              className={classNames(
                'text-sm mt-3',
                installed ? 'text-text-secondary' : selected ? 'text-white' : 'text-text-secondary'
              )}
            >
              {capability.description}
            </p>
            {isCore && (
              <ul
                className={classNames(
                  'mt-3 space-y-1',
                  installed ? 'text-text-secondary' : selected ? 'text-white' : 'text-text-secondary'
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
          <h2 className="text-3xl font-bold text-text-primary mb-2">{t('easySetup.step1.heading')}</h2>
          <p className="text-text-secondary">
            {t('easySetup.step1.subheading')}
          </p>
        </div>

        {allInstalled ? (
          <div className="text-center py-12">
            <p className="text-text-secondary text-lg">
              {t('easySetup.step1.allInstalled')}
            </p>
            <StyledButton
              variant="primary"
              className="mt-4"
              onClick={() => router.visit('/settings/apps')}
            >
              {t('easySetup.step1.manageApps')}
            </StyledButton>
          </div>
        ) : (
          <>
            {/* Core Capabilities */}
            {existingCoreCapabilities.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-4">{t('easySetup.step1.coreCapabilities')}</h3>
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
                  <h3 className="text-md font-medium text-text-muted">{t('easySetup.step1.additionalTools')}</h3>
                  {showAdditionalTools ? (
                    <IconChevronUp size={20} className="text-text-muted" />
                  ) : (
                    <IconChevronDown size={20} className="text-text-muted" />
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
        <h2 className="text-3xl font-bold text-text-primary mb-2">{t('easySetup.step2.heading')}</h2>
        <p className="text-text-secondary">
          {t('easySetup.step2.subheading')}
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
          <p className="text-text-secondary text-lg">{t('easySetup.step2.noCollections')}</p>
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
          <h2 className="text-3xl font-bold text-text-primary mb-2">{t('easySetup.step3.heading')}</h2>
          <p className="text-text-secondary">
            {isAiSelected && isInformationSelected
              ? t('easySetup.step3.subtextBoth')
              : isAiSelected
                ? t('easySetup.step3.subtextAi')
                : isInformationSelected
                  ? t('easySetup.step3.subtextInfo')
                  : t('easySetup.step3.subtextDefault')}
          </p>
        </div>

        {/* AI Model Selection - Only show if AI capability is selected */}
        {isAiSelected && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-surface-primary border border-border-subtle flex items-center justify-center shadow-sm">
                <IconCpu className="w-6 h-6 text-text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-text-primary">{t('easySetup.step3.aiModels')}</h3>
                <p className="text-sm text-text-muted">{t('easySetup.step3.aiModelsSubtext')}</p>
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
                        : 'border-desert-stone-light bg-surface-primary hover:border-desert-green hover:shadow-sm',
                      !isOnline && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4
                          className={classNames(
                            'text-lg font-semibold mb-1',
                            selectedAiModels.includes(model.name) ? 'text-white' : 'text-text-primary'
                          )}
                        >
                          {model.name}
                        </h4>
                        <p
                          className={classNames(
                            'text-sm mb-2',
                            selectedAiModels.includes(model.name) ? 'text-white' : 'text-text-secondary'
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
                                : 'text-text-muted'
                            )}
                          >
                            {t('easySetup.step3.size', { size: model.tags[0].size })}
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
              <div className="text-center py-8 bg-surface-secondary rounded-lg">
                <p className="text-text-secondary">{t('easySetup.step3.noModels')}</p>
              </div>
            )}
          </div>
        )}

        {/* Wikipedia Selection - Only show if Information capability is selected */}
        {isInformationSelected && (
          <>
            {/* Divider between AI Models and Wikipedia */}
            {isAiSelected && <hr className="my-8 border-border-subtle" />}

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
            <hr className="my-8 border-border-subtle" />

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-surface-primary border border-border-subtle flex items-center justify-center shadow-sm">
                <IconBooks className="w-6 h-6 text-text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-text-primary">{t('easySetup.step3.additionalContent')}</h3>
                <p className="text-sm text-text-muted">{t('easySetup.step3.additionalContentSubtext')}</p>
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
            <p className="text-text-secondary text-lg">
              {t('easySetup.step3.noContentCapabilities')}
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
          <h2 className="text-3xl font-bold text-text-primary mb-2">{t('easySetup.step4.heading')}</h2>
          <p className="text-text-secondary">{t('easySetup.step4.subheading')}</p>
        </div>

        {!hasSelections ? (
          <Alert
            title={t('easySetup.step4.noSelections')}
            message={t('easySetup.step4.noSelectionsMessage')}
            type="info"
            variant="bordered"
          />
        ) : (
          <div className="space-y-6">
            {selectedServices.length > 0 && (
              <div className="bg-surface-primary rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-text-primary mb-4">
                  {t('easySetup.step4.capabilitiesToInstall')}
                </h3>
                <ul className="space-y-2">
                  {[...CORE_CAPABILITIES, ...ADDITIONAL_TOOLS]
                    .filter((cap) => cap.services.some((s) => selectedServices.includes(s)))
                    .map((capability) => (
                      <li key={capability.id} className="flex items-center">
                        <IconCheck size={20} className="text-desert-green mr-2" />
                        <span className="text-text-primary">
                          {capability.name}
                          <span className="text-text-muted text-sm ml-2">
                            ({capability.technicalName})
                          </span>
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {selectedMapCollections.length > 0 && (
              <div className="bg-surface-primary rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-text-primary mb-4">
                  {t('easySetup.step4.mapCollections', { count: selectedMapCollections.length })}
                </h3>
                <ul className="space-y-2">
                  {selectedMapCollections.map((slug) => {
                    const collection = mapCollections?.find((c) => c.slug === slug)
                    return (
                      <li key={slug} className="flex items-center">
                        <IconCheck size={20} className="text-desert-green mr-2" />
                        <span className="text-text-primary">{collection?.name || slug}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {selectedTiers.size > 0 && (
              <div className="bg-surface-primary rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-text-primary mb-4">
                  {t('easySetup.step4.contentCategories', { count: selectedTiers.size })}
                </h3>
                {Array.from(selectedTiers.entries()).map(([categorySlug, tier]) => {
                  const category = categories?.find((c) => c.slug === categorySlug)
                  if (!category) return null
                  const resources = resolveTierResources(tier, category.tiers)
                  return (
                    <div key={categorySlug} className="mb-4 last:mb-0">
                      <div className="flex items-center mb-2">
                        <IconCheck size={20} className="text-desert-green mr-2" />
                        <span className="text-text-primary font-medium">
                          {category.name} - {tier.name}
                        </span>
                        <span className="text-text-muted text-sm ml-2">
                          ({t('easySetup.step4.files', { count: resources.length })})
                        </span>
                      </div>
                      <ul className="ml-7 space-y-1">
                        {resources.map((resource, idx) => (
                          <li key={idx} className="text-sm text-text-secondary">
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
              <div className="bg-surface-primary rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-text-primary mb-4">{t('easySetup.step4.wikipedia')}</h3>
                {(() => {
                  const option = wikipediaState?.options.find((o) => o.id === selectedWikipedia)
                  return option ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <IconCheck size={20} className="text-desert-green mr-2" />
                        <span className="text-text-primary">{option.name}</span>
                      </div>
                      <span className="text-text-muted text-sm">
                        {option.size_mb > 0
                          ? `${(option.size_mb / 1024).toFixed(1)} GB`
                          : t('easySetup.step4.noDownload')}
                      </span>
                    </div>
                  ) : null
                })()}
              </div>
            )}

            {selectedAiModels.length > 0 && (
              <div className="bg-surface-primary rounded-lg border-2 border-desert-stone-light p-6">
                <h3 className="text-xl font-semibold text-text-primary mb-4">
                  {t('easySetup.step4.aiModelsToDownload', { count: selectedAiModels.length })}
                </h3>
                <ul className="space-y-2">
                  {selectedAiModels.map((modelName) => {
                    const model = recommendedModels?.find((m) => m.name === modelName)
                    return (
                      <li key={modelName} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <IconCheck size={20} className="text-desert-green mr-2" />
                          <span className="text-text-primary">{modelName}</span>
                        </div>
                        {model?.tags?.[0]?.size && (
                          <span className="text-text-muted text-sm">{model.tags[0].size}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <Alert
              title={t('easySetup.step4.readyToStart')}
              message={t('easySetup.step4.readyToStartMessage')}
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
      <Head title={t('easySetup.title')} />
      {!isOnline && (
        <Alert
          title={t('easySetup.noInternet')}
          message={t('easySetup.noInternetMessage')}
          type="warning"
          variant="solid"
          className="mb-8"
        />
      )}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-surface-primary rounded-md shadow-md">
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
                    {t('easySetup.back')}
                  </StyledButton>
                )}

                <p className="text-sm text-text-secondary">
                  {(() => {
                    const count = [...CORE_CAPABILITIES, ...ADDITIONAL_TOOLS].filter((cap) =>
                      cap.services.some((s) => selectedServices.includes(s))
                    ).length
                    return `${count} ${count === 1 ? t('easySetup.capability') : t('easySetup.capabilities')}`
                  })()}
                  , {selectedMapCollections.length} {t('easySetup.steps.maps').toLowerCase()}
                  , {selectedTiers.size} {t('easySetup.steps.content').toLowerCase()}
                  , {selectedAiModels.length} {t('easySetup.step3.aiModels')}
                </p>
              </div>

              <div className="flex space-x-4">
                <StyledButton
                  onClick={() => router.visit('/home')}
                  disabled={isProcessing}
                  variant="outline"
                >
                  {t('easySetup.cancelGoHome')}
                </StyledButton>

                {currentStep < 4 ? (
                  <StyledButton
                    onClick={handleNext}
                    disabled={!canProceedToNextStep() || isProcessing}
                    variant="primary"
                    icon="IconChevronRight"
                  >
                    {t('easySetup.next')}
                  </StyledButton>
                ) : (
                  <StyledButton
                    onClick={handleFinish}
                    disabled={isProcessing || !isOnline || !anySelectionMade}
                    loading={isProcessing}
                    variant="success"
                    icon="IconCheck"
                  >
                    {t('easySetup.completeSetup')}
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
