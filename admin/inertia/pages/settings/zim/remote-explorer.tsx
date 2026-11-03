import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import api from '~/lib/api'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import { Head } from '@inertiajs/react'
import { ListRemoteZimFilesResponse, RemoteZimFileEntry } from '../../../../types/zim'
import { formatBytes } from '~/lib/util'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import { useNotifications } from '~/context/NotificationContext'
import useInternetStatus from '~/hooks/useInternetStatus'
import Alert from '~/components/Alert'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import Input from '~/components/inputs/Input'
import {
  IconSearch,
  IconBooks,
  IconFolder,
  IconFileDownload,
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconLibrary,
} from '@tabler/icons-react'
import useDebounce from '~/hooks/useDebounce'
import CategoryCard from '~/components/CategoryCard'
import CreatorPacksSection from '~/components/CreatorPacksSection'
import TierSelectionModal from '~/components/TierSelectionModal'
import WikipediaSelector from '~/components/WikipediaSelector'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import type { CategoryWithStatus, SpecTier } from '../../../../types/collections'
import useDownloads from '~/hooks/useDownloads'
import ActiveDownloads from '~/components/ActiveDownloads'
import { SERVICE_NAMES } from '../../../../constants/service_names'
import { ZimFileWithMetadata } from '../../../../types/zim'

const CURATED_CATEGORIES_KEY = 'curated-categories'
const WIKIPEDIA_STATE_KEY = 'wikipedia-state'
const CUSTOM_LIBRARIES_KEY = 'custom-libraries'
const ZIM_FILES_KEY = 'zim-files'

type CustomLibrary = { id: number; name: string; base_url: string; is_default: boolean }
type BrowseResult = {
  directories: { name: string; url: string }[]
  files: { name: string; url: string; size_bytes: number | null }[]
}

export default function ZimRemoteExplorer() {
  const { t, i18n } = useTranslation('content')
  const queryClient = useQueryClient()
  const tableParentRef = useRef<HTMLDivElement>(null)

  const { openModal, closeAllModals } = useModals()
  const { addNotification } = useNotifications()
  const { isOnline } = useInternetStatus()
  const { isInstalled } = useServiceInstalledStatus(SERVICE_NAMES.KIWIX)
  const { debounce } = useDebounce()

  const [query, setQuery] = useState('')
  const [queryUI, setQueryUI] = useState('')

  const [tierModalOpen, setTierModalOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryWithStatus | null>(null)

  const [selectedWikipedia, setSelectedWikipedia] = useState<string | null>(null)
  const [isSubmittingWikipedia, setIsSubmittingWikipedia] = useState(false)

  const [selectedSource, setSelectedSource] = useState<'default' | number>(() => {
    try {
      const saved = localStorage.getItem('nomad:zim-library-source')
      if (saved && saved !== 'default') return parseInt(saved, 10)
    } catch {}
    return 'default'
  })
  const [browseUrl, setBrowseUrl] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; url: string }[]>([])
  const [manageModalOpen, setManageModalOpen] = useState(false)
  const [newLibraryName, setNewLibraryName] = useState('')
  const [newLibraryUrl, setNewLibraryUrl] = useState('')

  const debouncedSetQuery = debounce((val: string) => {
    setQuery(val)
  }, 400)

  const { data: categories } = useQuery({
    queryKey: [CURATED_CATEGORIES_KEY],
    queryFn: () => api.listCuratedCategories(),
    refetchOnWindowFocus: false,
  })

  const { data: wikipediaState, isLoading: isLoadingWikipedia } = useQuery({
    queryKey: [WIKIPEDIA_STATE_KEY],
    queryFn: () => api.getWikipediaState(),
    refetchOnWindowFocus: false,
  })

  const { data: localFiles } = useQuery<ZimFileWithMetadata[]>({
    queryKey: [ZIM_FILES_KEY],
    queryFn: async () => {
      const res = await api.listZimFiles()
      return res.data.files
    },
    refetchOnWindowFocus: false,
  })

  const { data: downloads, invalidate: invalidateDownloads } = useDownloads({
    filetype: 'zim',
    enabled: true,
  })

  const { data: customLibraries } = useQuery({
    queryKey: [CUSTOM_LIBRARIES_KEY],
    queryFn: () => api.listCustomLibraries(),
    refetchOnWindowFocus: false,
  })

  const {
    data: browseData,
    isLoading: isBrowsing,
    error: browseError,
  } = useQuery<BrowseResult>({
    queryKey: ['browse-library', browseUrl],
    queryFn: () => api.browseLibrary(browseUrl!) as Promise<BrowseResult>,
    enabled: !!browseUrl && selectedSource !== 'default',
    refetchOnWindowFocus: false,
    retry: false,
  })

  const { data, fetchNextPage, isFetching, isLoading } =
    useInfiniteQuery<ListRemoteZimFilesResponse>({
      queryKey: ['remote-zim-files', query],
      queryFn: async ({ pageParam = 0 }) => {
        const start = typeof pageParam === 'number' ? pageParam : 0
        const res = await api.listRemoteZimFiles({ start, count: 12, query: query || undefined })
        if (!res) {
          throw new Error('Failed to fetch remote ZIM files.')
        }
        return res.data
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_start : undefined),
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
      enabled: selectedSource === 'default',
    })

  const flatData = useMemo(() => {
    const mapped = data?.pages.flatMap((page) => page.items) || []
    const localNames = new Set(localFiles?.map((f) => f.name) ?? [])
    return mapped.filter((item) => {
      const isDownloading = downloads?.some((download) => {
        const filename = item.download_url.split('/').pop()
        return filename && download.filepath.endsWith(filename)
      })
      const isPresent = localNames.has(item.file_name)
      return !isDownloading && !isPresent
    })
  }, [data, downloads, localFiles])
  const hasMore = useMemo(() => data?.pages[data.pages.length - 1]?.has_more || false, [data])

  const prevDownloadKeysRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const currentKeys = new Set((downloads ?? []).map((d) => d.jobId))
    let anyRemoved = false
    for (const key of prevDownloadKeysRef.current) {
      if (!currentKeys.has(key)) {
        anyRemoved = true
        break
      }
    }
    prevDownloadKeysRef.current = currentKeys
    if (anyRemoved) {
      queryClient.invalidateQueries({ queryKey: [ZIM_FILES_KEY] })
    }
  }, [downloads, queryClient])

  const fetchOnBottomReached = useCallback(
    (parentRef?: HTMLDivElement | null) => {
      if (parentRef) {
        const { scrollHeight, scrollTop, clientHeight } = parentRef
        if (scrollHeight - scrollTop - clientHeight < 200 && !isFetching && hasMore) {
          fetchNextPage()
        }
      }
    },
    [fetchNextPage, isFetching, hasMore]
  )

  useEffect(() => {
    fetchOnBottomReached(tableParentRef.current)
  }, [fetchOnBottomReached])

  useEffect(() => {
    if (selectedSource !== 'default' && customLibraries) {
      const lib = customLibraries.find((l) => l.id === selectedSource)
      if (lib && !browseUrl) {
        setBrowseUrl(lib.base_url)
        setBreadcrumbs([{ name: lib.name, url: lib.base_url }])
      } else if (!lib) {
        setSelectedSource('default')
        localStorage.setItem('nomad:zim-library-source', 'default')
      }
    }
  }, [customLibraries, selectedSource])

  const handleSourceChange = (value: string) => {
    localStorage.setItem('nomad:zim-library-source', value)
    if (value === 'default') {
      setSelectedSource('default')
      setBrowseUrl(null)
      setBreadcrumbs([])
    } else {
      const id = parseInt(value, 10)
      const lib = customLibraries?.find((l) => l.id === id)
      if (lib) {
        setSelectedSource(id)
        setBrowseUrl(lib.base_url)
        setBreadcrumbs([{ name: lib.name, url: lib.base_url }])
      }
    }
  }

  const navigateToDirectory = (name: string, url: string) => {
    setBrowseUrl(url)
    setBreadcrumbs((prev) => [...prev, { name, url }])
  }

  const navigateToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index]
    setBrowseUrl(crumb.url)
    setBreadcrumbs((prev) => prev.slice(0, index + 1))
  }

  async function confirmDownload(record: RemoteZimFileEntry) {
    openModal(
      <StyledModal
        title={t('explorer.confirm_download_title')}
        onConfirm={() => {
          downloadFile(record)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText={t('common:buttons.confirm', { defaultValue: 'Download' })}
        cancelText={t('common:buttons.cancel', { defaultValue: 'Cancel' })}
        confirmVariant="primary"
      >
        <p className="text-text-primary">
          <Trans
            i18nKey="explorer.confirm_download_msg"
            ns="content"
            values={{ name: record.title, sizeClause: '' }}
            components={[<strong />, <strong />]}
          />
        </p>
      </StyledModal>,
      'confirm-download-file-modal'
    )
  }

  async function confirmCustomDownload(file: { name: string; url: string; size_bytes: number | null }) {
    openModal(
      <StyledModal
        title={t('explorer.confirm_download_title')}
        onConfirm={() => {
          downloadCustomFile(file)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText={t('common:buttons.confirm', { defaultValue: 'Download' })}
        cancelText={t('common:buttons.cancel', { defaultValue: 'Cancel' })}
        confirmVariant="primary"
      >
        <p className="text-text-primary">
          <Trans
            i18nKey="explorer.confirm_download_msg"
            ns="content"
            values={{
              name: file.name,
              sizeClause: file.size_bytes ? t('explorer.download_file_size', { size: formatBytes(file.size_bytes) }) : '',
            }}
            components={[<strong />, <strong />]}
          />
        </p>
      </StyledModal>,
      'confirm-download-custom-modal'
    )
  }

  async function downloadFile(record: RemoteZimFileEntry) {
    try {
      await api.downloadRemoteZimFile(record.download_url, {
        title: record.title,
        summary: record.summary,
        author: record.author,
        size_bytes: record.size_bytes,
      })
      invalidateDownloads()
    } catch (error) {
      console.error('Error downloading file:', error)
    }
  }

  async function downloadCustomFile(file: { name: string; url: string; size_bytes: number | null }) {
    try {
      await api.downloadRemoteZimFile(file.url, {
        title: file.name.replace(/\.zim$/, ''),
        size_bytes: file.size_bytes ?? undefined,
      })
      addNotification({
        message: t('explorer.started_downloading', { name: file.name }),
        type: 'success',
      })
      invalidateDownloads()
    } catch (error) {
      console.error('Error downloading file:', error)
      addNotification({
        message: t('explorer.download_start_failed'),
        type: 'error',
      })
    }
  }

  const handleCategoryClick = (category: CategoryWithStatus) => {
    if (!isOnline) return
    setActiveCategory(category)
    setTierModalOpen(true)
  }

  const handleTierSelect = async (category: CategoryWithStatus, tier: SpecTier) => {
    try {
      await api.downloadCategoryTier(category.slug, tier.slug)

      addNotification({
        message: t('explorer.started_category_tier', { category: category.name, tier: tier.name }),
        type: 'success',
      })
      invalidateDownloads()
      queryClient.invalidateQueries({ queryKey: [CURATED_CATEGORIES_KEY] })
    } catch (error) {
      console.error('Error downloading tier resources:', error)
      addNotification({
        message: t('explorer.tier_download_error'),
        type: 'error',
      })
    }
  }

  const closeTierModal = () => {
    setTierModalOpen(false)
    setActiveCategory(null)
  }

  const handleWikipediaSelect = (optionId: string) => {
    if (!isOnline) return
    setSelectedWikipedia(optionId)
  }

  const handleWikipediaSubmit = async () => {
    if (!selectedWikipedia) return

    setIsSubmittingWikipedia(true)
    try {
      const result = await api.selectWikipedia(selectedWikipedia)
      if (result?.success) {
        addNotification({
          message:
            selectedWikipedia === 'none'
              ? t('explorer.wikipedia_removed')
              : t('explorer.wikipedia_download_started'),
          type: 'success',
        })
        invalidateDownloads()
        queryClient.invalidateQueries({ queryKey: [WIKIPEDIA_STATE_KEY] })
        setSelectedWikipedia(null)
      } else {
        addNotification({
          message: result?.message || t('explorer.wikipedia_change_failed'),
          type: 'error',
        })
      }
    } catch (error) {
      console.error('Error selecting Wikipedia:', error)
      addNotification({
        message: t('explorer.wikipedia_error'),
        type: 'error',
      })
    } finally {
      setIsSubmittingWikipedia(false)
    }
  }

  const refreshManifests = useMutation({
    mutationFn: () => api.refreshManifests(),
    onSuccess: () => {
      addNotification({
        message: t('explorer.manifests_refreshed'),
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: [CURATED_CATEGORIES_KEY] })
      queryClient.invalidateQueries({ queryKey: [WIKIPEDIA_STATE_KEY] })
    },
  })

  const addLibraryMutation = useMutation({
    mutationFn: () => api.addCustomLibrary(newLibraryName.trim(), newLibraryUrl.trim()),
    onSuccess: () => {
      addNotification({ message: t('explorer.custom_lib_added'), type: 'success' })
      queryClient.invalidateQueries({ queryKey: [CUSTOM_LIBRARIES_KEY] })
      setNewLibraryName('')
      setNewLibraryUrl('')
    },
    onError: () => {
      addNotification({ message: t('explorer.custom_lib_add_failed'), type: 'error' })
    },
  })

  const removeLibraryMutation = useMutation({
    mutationFn: (id: number) => api.removeCustomLibrary(id),
    onSuccess: (_data, id) => {
      addNotification({ message: t('explorer.custom_lib_removed'), type: 'success' })
      queryClient.invalidateQueries({ queryKey: [CUSTOM_LIBRARIES_KEY] })
      if (selectedSource === id) {
        setSelectedSource('default')
        setBrowseUrl(null)
        setBreadcrumbs([])
      }
    },
  })

  const hasCustomLibraries = customLibraries && customLibraries.length > 0

  return (
    <SettingsLayout>
      <Head title={t('explorer.head_title')} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">{t('explorer.title')}</h1>
              <p className="text-text-muted">{t('explorer.subtitle')}</p>
            </div>
          </div>
          {!isOnline && (
            <Alert
              title={t('explorer.no_internet_warning')}
              message=""
              type="warning"
              variant="solid"
              className="!mt-6"
            />
          )}
          {!isInstalled && (
            <Alert
              title={t('explorer.kiwix_not_installed')}
              type="warning"
              variant="solid"
              className="!mt-6"
            />
          )}
          <div className="mt-8 mb-6 flex items-center justify-between">
            <StyledSectionHeader title={t('explorer.curated_content')} className="!mb-0" />
            <StyledButton
              onClick={() => refreshManifests.mutate()}
              disabled={refreshManifests.isPending || !isOnline}
              icon="IconRefresh"
            >
              {t('explorer.force_refresh_collections')}
            </StyledButton>
          </div>

          {/* Wikipedia Selector */}
          {isLoadingWikipedia ? (
            <div className="mt-8 bg-surface-primary rounded-lg border border-border-subtle p-6">
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-desert-green"></div>
              </div>
            </div>
          ) : wikipediaState && wikipediaState.options.length > 0 ? (
            <div className="mt-8 bg-surface-primary rounded-lg border border-border-subtle p-6">
              <WikipediaSelector
                options={wikipediaState.options}
                currentSelection={wikipediaState.currentSelection}
                selectedOptionId={selectedWikipedia}
                onSelect={handleWikipediaSelect}
                disabled={!isOnline}
                showSubmitButton
                onSubmit={handleWikipediaSubmit}
                isSubmitting={isSubmittingWikipedia}
              />
            </div>
          ) : null}

          {/* Creator Packs */}
          <CreatorPacksSection />

          {/* Tiered Category Collections */}
          <div className="flex items-center gap-3 mt-8 mb-4">
            <div className="w-10 h-10 rounded-full bg-surface-primary border border-border-subtle flex items-center justify-center shadow-sm">
              <IconBooks className="w-6 h-6 text-text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-text-primary">{t('explorer.additional_content')}</h3>
              <p className="text-sm text-text-muted">{t('explorer.additional_content_desc')}</p>
            </div>
          </div>
          {categories && categories.length > 0 ? (
            <>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categories.map((category) => (
                  <CategoryCard
                    key={category.slug}
                    category={category}
                    selectedTier={null}
                    onClick={handleCategoryClick}
                  />
                ))}
              </div>

              <TierSelectionModal
                isOpen={tierModalOpen}
                onClose={closeTierModal}
                category={activeCategory}
                selectedTierSlug={activeCategory?.installedTierSlug}
                onSelectTier={handleTierSelect}
              />
            </>
          ) : (
            <p className="text-text-muted mt-4">{t('explorer.no_curated_categories')}</p>
          )}

          {/* Kiwix Library / Custom Library Browser */}
          <div className="mt-12 mb-4 flex items-center justify-between">
            <StyledSectionHeader title={t('explorer.browse_kiwix_library')} className="!mb-0" />
            <StyledButton
              onClick={() => setManageModalOpen(true)}
              disabled={!isOnline}
              icon="IconLibrary"
            >
              {hasCustomLibraries ? t('explorer.manage_custom_libraries') : t('explorer.add_custom_library')}
            </StyledButton>
          </div>

          {/* Source selector dropdown */}
          {hasCustomLibraries && (
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm font-medium text-text-secondary">{t('explorer.source_label')}</label>
              <select
                value={selectedSource === 'default' ? 'default' : String(selectedSource)}
                onChange={(e) => handleSourceChange(e.target.value)}
                className="rounded-md border border-border-default bg-surface-primary text-text-primary px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-desert-green"
              >
                <option value="default">{t('explorer.default_kiwix')}</option>
                {customLibraries.map((lib) => (
                  <option key={lib.id} value={String(lib.id)}>
                    {lib.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Default Kiwix library browser */}
          {selectedSource === 'default' && (
            <>
              <div className="flex justify-start mt-4">
                <Input
                  name="search"
                  label=""
                  placeholder={t('explorer.search_zim_placeholder')}
                  value={queryUI}
                  onChange={(e) => {
                    setQueryUI(e.target.value)
                    debouncedSetQuery(e.target.value)
                  }}
                  className="w-1/3"
                  leftIcon={<IconSearch className="w-5 h-5 text-text-muted" />}
                />
              </div>
              <StyledTable<RemoteZimFileEntry & { actions?: any }>
                data={flatData}
                ref={tableParentRef}
                loading={isLoading}
                columns={[
                  {
                    accessor: 'title',
                  },
                  {
                    accessor: 'author',
                  },
                  {
                    accessor: 'summary',
                    render(record) {
                      return (
                        <span className="block max-w-md truncate text-text-muted" title={record.summary}>
                          {record.summary}
                        </span>
                      )
                    },
                  },
                  {
                    accessor: 'updated',
                    render(record) {
                      return new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en-US', {
                        dateStyle: 'medium',
                      }).format(new Date(record.updated))
                    },
                  },
                  {
                    accessor: 'size_bytes',
                    title: t('explorer.th_size'),
                    render(record) {
                      return formatBytes(record.size_bytes)
                    },
                  },
                  {
                    accessor: 'actions',
                    render(record) {
                      return (
                        <div className="flex space-x-2">
                          <StyledButton
                            icon={'IconDownload'}
                            onClick={() => {
                              confirmDownload(record)
                            }}
                          >
                            {t('common:buttons.confirm', { defaultValue: 'Download' })}
                          </StyledButton>
                        </div>
                      )
                    },
                  },
                ]}
                expandable={{
                  expandedRowRender(record) {
                    const issuedDate = record.issued ? new Date(record.issued) : null
                    const hasValidIssuedDate = issuedDate && !Number.isNaN(issuedDate.getTime())
                    return (
                      <div className="py-4 px-6">
                        <p className="text-sm text-text-primary mb-4">{record.summary}</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
                          {record.author && (
                            <div>
                              <span className="text-text-muted">{t('explorer.details_author')}</span>
                              <span className="text-text-primary">{record.author}</span>
                            </div>
                          )}
                          {record.publisher && (
                            <div>
                              <span className="text-text-muted">{t('explorer.details_publisher')}</span>
                              <span className="text-text-primary">{record.publisher}</span>
                            </div>
                          )}
                          {record.language && (
                            <div>
                              <span className="text-text-muted">{t('explorer.details_language')}</span>
                              <span className="text-text-primary">{record.language}</span>
                            </div>
                          )}
                          {record.category && (
                            <div>
                              <span className="text-text-muted">{t('explorer.details_category')}</span>
                              <span className="text-text-primary">{record.category}</span>
                            </div>
                          )}
                          {record.article_count != null && record.article_count > 0 && (
                            <div>
                              <span className="text-text-muted">{t('explorer.details_articles')}</span>
                              <span className="text-text-primary">
                                {record.article_count.toLocaleString()}
                              </span>
                            </div>
                          )}
                          {record.media_count != null && record.media_count > 0 && (
                            <div>
                              <span className="text-text-muted">{t('explorer.details_media')}</span>
                              <span className="text-text-primary">
                                {record.media_count.toLocaleString()}
                              </span>
                            </div>
                          )}
                          {hasValidIssuedDate && (
                            <div>
                              <span className="text-text-muted">{t('explorer.details_issued')}</span>
                              <span className="text-text-primary">
                                {new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en-US', {
                                  dateStyle: 'medium',
                                }).format(issuedDate!)}
                              </span>
                            </div>
                          )}
                          {record.size_bytes > 0 && (
                            <div>
                              <span className="text-text-muted">{t('explorer.details_size')}</span>
                              <span className="text-text-primary">{formatBytes(record.size_bytes)}</span>
                            </div>
                          )}
                        </div>
                        {record.tags && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {record.tags
                              .split(';')
                              .filter(Boolean)
                              .map((tag, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs font-medium text-text-muted"
                                >
                                  {tag.trim()}
                                </span>
                              ))}
                          </div>
                        )}
                        {record.file_name && (
                          <div className="mt-4">
                            <span className="text-text-muted text-sm">{t('explorer.details_file')}</span>
                            <code className="text-xs text-text-muted">{record.file_name}</code>
                          </div>
                        )}
                      </div>
                    )
                  },
                }}
                className="overflow-y-auto h-[600px] w-full mt-4"
                containerProps={{
                  onScroll: (e) => fetchOnBottomReached(e.currentTarget as HTMLDivElement),
                }}
                compact
                rowLines
              />
            </>
          )}

          {/* Custom library directory browser */}
          {selectedSource !== 'default' && (
            <div className="mt-4">
              <nav className="flex items-center gap-1 text-sm text-text-muted mb-4 flex-wrap">
                {breadcrumbs.map((crumb, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    {idx > 0 && <IconChevronRight className="w-4 h-4" />}
                    {idx < breadcrumbs.length - 1 ? (
                      <button
                        onClick={() => navigateToBreadcrumb(idx)}
                        className="text-desert-green hover:underline"
                      >
                        {crumb.name}
                      </button>
                    ) : (
                      <span className="text-text-primary font-medium">{crumb.name}</span>
                    )}
                  </span>
                ))}
              </nav>

              {isBrowsing && (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-desert-green"></div>
                </div>
              )}

              {browseError && (
                <Alert
                  title={t('explorer.directory_fetch_error_title')}
                  message={t('explorer.directory_fetch_error_msg')}
                  type="error"
                  variant="solid"
                />
              )}

              {!isBrowsing && !browseError && browseData && (
                <div className="bg-surface-primary rounded-lg border border-border-subtle overflow-hidden relative" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                  {browseData.directories.length === 0 && browseData.files.length === 0 ? (
                    <p className="text-text-muted p-6 text-center">
                      {t('explorer.no_items_found_location')}
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-subtle bg-surface-secondary sticky top-0 z-10">
                          <th className="text-left px-4 py-3 font-medium text-text-secondary">{t('explorer.th_name')}</th>
                          <th className="text-right px-4 py-3 font-medium text-text-secondary w-32">{t('explorer.th_size')}</th>
                          <th className="text-right px-4 py-3 font-medium text-text-secondary w-36"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {browseData.directories.map((dir) => (
                          <tr
                            key={dir.url}
                            className="border-b border-border-subtle hover:bg-surface-secondary cursor-pointer transition-colors"
                            onClick={() => navigateToDirectory(dir.name, dir.url)}
                          >
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-2 text-text-primary">
                                <IconFolder className="w-5 h-5 text-desert-orange" />
                                {dir.name}
                              </span>
                            </td>
                            <td className="text-right px-4 py-3 text-text-muted">--</td>
                            <td className="text-right px-4 py-3">
                              <IconChevronRight className="w-4 h-4 text-text-muted ml-auto" />
                            </td>
                          </tr>
                        ))}
                        {browseData.files.map((file) => (
                          <tr
                            key={file.url}
                            className="border-b border-border-subtle hover:bg-surface-secondary transition-colors"
                          >
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-2 text-text-primary">
                                <IconFileDownload className="w-5 h-5 text-desert-green" />
                                {file.name}
                              </span>
                            </td>
                            <td className="text-right px-4 py-3 text-text-muted">
                              {file.size_bytes ? formatBytes(file.size_bytes) : '--'}
                            </td>
                            <td className="text-right px-4 py-3">
                              <StyledButton
                                icon="IconDownload"
                                onClick={() => confirmCustomDownload(file)}
                              >
                                {t('common:buttons.confirm', { defaultValue: 'Download' })}
                              </StyledButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
          <ActiveDownloads filetype="zim" withHeader />

          {/* Manage Custom Libraries Modal */}
          <StyledModal
            title={t('explorer.modal_manage_title')}
            open={manageModalOpen}
            onCancel={() => setManageModalOpen(false)}
            cancelText={t('common:buttons.close', { defaultValue: 'Close' })}
          >
            <div className="space-y-6">
              <div>
                <p className="text-sm text-text-muted mb-4">
                  {t('explorer.modal_manage_desc')}
                </p>

                {customLibraries && customLibraries.length > 0 && (
                  <div className="space-y-2 mb-6">
                    {customLibraries.map((lib) => (
                      <div
                        key={lib.id}
                        className="flex items-center justify-between bg-surface-secondary rounded-lg px-4 py-3 border border-border-subtle"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-text-primary truncate">
                            {lib.name}
                            {lib.is_default && (
                              <span className="ml-2 text-xs text-text-muted font-normal">{t('explorer.builtin_tag')}</span>
                            )}
                          </p>
                          <p className="text-xs text-text-muted truncate">{lib.base_url}</p>
                        </div>
                        {!lib.is_default && (
                          <button
                            onClick={() => removeLibraryMutation.mutate(lib.id)}
                            className="ml-3 p-1.5 text-text-muted hover:text-red-500 transition-colors rounded"
                            title={t('explorer.remove_library_title')}
                          >
                            <IconTrash className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  <Input
                    name="library-name"
                    label={t('explorer.field_library_name')}
                    placeholder={t('explorer.field_library_name_ph')}
                    value={newLibraryName}
                    onChange={(e) => setNewLibraryName(e.target.value)}
                  />
                  <Input
                    name="library-url"
                    label={t('explorer.field_base_url')}
                    placeholder={t('explorer.field_base_url_ph')}
                    value={newLibraryUrl}
                    onChange={(e) => setNewLibraryUrl(e.target.value)}
                  />
                  <StyledButton
                    icon="IconPlus"
                    onClick={() => addLibraryMutation.mutate()}
                    disabled={
                      !newLibraryName.trim() ||
                      !newLibraryUrl.trim() ||
                      addLibraryMutation.isPending
                    }
                  >
                    {t('explorer.btn_add_library')}
                  </StyledButton>
                </div>
              </div>
            </div>
          </StyledModal>
        </main>
      </div>
    </SettingsLayout>
  )
}
