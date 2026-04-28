import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import api from '~/lib/api'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
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
import TierSelectionModal from '~/components/TierSelectionModal'
import WikipediaSelector from '~/components/WikipediaSelector'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import type { CategoryWithStatus, SpecTier } from '../../../../types/collections'
import useDownloads from '~/hooks/useDownloads'
import ActiveDownloads from '~/components/ActiveDownloads'
import { SERVICE_NAMES } from '../../../../constants/service_names'

const CURATED_CATEGORIES_KEY = 'curated-categories'
const WIKIPEDIA_STATE_KEY = 'wikipedia-state'
const CUSTOM_LIBRARIES_KEY = 'custom-libraries'

type CustomLibrary = { id: number; name: string; base_url: string; is_default: boolean }
type BrowseResult = {
  directories: { name: string; url: string }[]
  files: { name: string; url: string; size_bytes: number | null }[]
}

export default function ZimRemoteExplorer() {
  const queryClient = useQueryClient()
  const tableParentRef = useRef<HTMLDivElement>(null)

  const { openModal, closeAllModals } = useModals()
  const { addNotification } = useNotifications()
  const { isOnline } = useInternetStatus()
  const { isInstalled } = useServiceInstalledStatus(SERVICE_NAMES.KIWIX)
  const { debounce } = useDebounce()

  const [query, setQuery] = useState('')
  const [queryUI, setQueryUI] = useState('')

  // Category/tier selection state
  const [tierModalOpen, setTierModalOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryWithStatus | null>(null)

  // Wikipedia selection state
  const [selectedWikipedia, setSelectedWikipedia] = useState<string | null>(null)
  const [isSubmittingWikipedia, setIsSubmittingWikipedia] = useState(false)

  // Custom library state - persist selection to localStorage
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

  // Fetch curated categories with tiers
  const { data: categories } = useQuery({
    queryKey: [CURATED_CATEGORIES_KEY],
    queryFn: () => api.listCuratedCategories(),
    refetchOnWindowFocus: false,
  })

  // Fetch Wikipedia options and state
  const { data: wikipediaState, isLoading: isLoadingWikipedia } = useQuery({
    queryKey: [WIKIPEDIA_STATE_KEY],
    queryFn: () => api.getWikipediaState(),
    refetchOnWindowFocus: false,
  })

  const { data: downloads, invalidate: invalidateDownloads } = useDownloads({
    filetype: 'zim',
    enabled: true,
  })

  // Fetch custom libraries
  const { data: customLibraries } = useQuery({
    queryKey: [CUSTOM_LIBRARIES_KEY],
    queryFn: () => api.listCustomLibraries(),
    refetchOnWindowFocus: false,
  })

  // Browse custom library directory
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
        // pageParam is an opaque Kiwix offset returned by the backend as `next_start`.
        // The backend accumulates across multiple upstream pages when needed (#731), so the
        // frontend can't derive the next offset from a 12-item page assumption.
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
    // remove items that are currently downloading
    return mapped.filter((item) => {
      const isDownloading = downloads?.some((download) => {
        const filename = item.download_url.split('/').pop()
        return filename && download.filepath.endsWith(filename)
      })
      return !isDownloading
    })
  }, [data, downloads])
  const hasMore = useMemo(() => data?.pages[data.pages.length - 1]?.has_more || false, [data])

  const fetchOnBottomReached = useCallback(
    (parentRef?: HTMLDivElement | null) => {
      if (parentRef) {
        const { scrollHeight, scrollTop, clientHeight } = parentRef
        // Fetch more when near the bottom. The `flatData.length > 0` guard that used to be
        // here caused the #731 deadlock when a heavily-saturated install returned an empty
        // page with has_more=true — removing it lets the existing on-mount/on-data effect
        // below drive bounded auto-fetch until hasMore flips false.
        if (scrollHeight - scrollTop - clientHeight < 200 && !isFetching && hasMore) {
          fetchNextPage()
        }
      }
    },
    [fetchNextPage, isFetching, hasMore]
  )

  const virtualizer = useVirtualizer({
    count: flatData.length,
    estimateSize: () => 48, // Estimate row height
    getScrollElement: () => tableParentRef.current,
    overscan: 5, // Number of items to render outside the visible area
  })

  //a check on mount and after a fetch to see if the table is already scrolled to the bottom and immediately needs to fetch more data
  useEffect(() => {
    fetchOnBottomReached(tableParentRef.current)
  }, [fetchOnBottomReached])

  // Restore custom library selection on mount when data loads
  useEffect(() => {
    if (selectedSource !== 'default' && customLibraries) {
      const lib = customLibraries.find((l) => l.id === selectedSource)
      if (lib && !browseUrl) {
        setBrowseUrl(lib.base_url)
        setBreadcrumbs([{ name: lib.name, url: lib.base_url }])
      } else if (!lib) {
        // Saved library was deleted
        setSelectedSource('default')
        localStorage.setItem('nomad:zim-library-source', 'default')
      }
    }
  }, [customLibraries, selectedSource])

  // When selecting a custom library, navigate to its root
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
        title="Confirm Download?"
        onConfirm={() => {
          downloadFile(record)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Download"
        cancelText="Cancel"
        confirmVariant="primary"
      >
        <p className="text-text-primary">
          Are you sure you want to download{' '}
          <strong>{record.title}</strong>? It may take some time for it
          to be available depending on the file size and your internet connection. The Kiwix
          application will be restarted after the download is complete.
        </p>
      </StyledModal>,
      'confirm-download-file-modal'
    )
  }

  async function confirmCustomDownload(file: { name: string; url: string; size_bytes: number | null }) {
    openModal(
      <StyledModal
        title="Confirm Download?"
        onConfirm={() => {
          downloadCustomFile(file)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Download"
        cancelText="Cancel"
        confirmVariant="primary"
      >
        <p className="text-text-primary">
          Are you sure you want to download{' '}
          <strong>{file.name}</strong>
          {file.size_bytes ? ` (${formatBytes(file.size_bytes)})` : ''}? The Kiwix
          application will be restarted after the download is complete.
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
        message: `Started downloading "${file.name}"`,
        type: 'success',
      })
      invalidateDownloads()
    } catch (error) {
      console.error('Error downloading file:', error)
      addNotification({
        message: 'Failed to start download.',
        type: 'error',
      })
    }
  }

  // Category/tier handlers
  const handleCategoryClick = (category: CategoryWithStatus) => {
    if (!isOnline) return
    setActiveCategory(category)
    setTierModalOpen(true)
  }

  const handleTierSelect = async (category: CategoryWithStatus, tier: SpecTier) => {
    try {
      await api.downloadCategoryTier(category.slug, tier.slug)

      addNotification({
        message: `Started downloading "${category.name} - ${tier.name}"`,
        type: 'success',
      })
      invalidateDownloads()

      // Refresh categories to update the installed tier display
      queryClient.invalidateQueries({ queryKey: [CURATED_CATEGORIES_KEY] })
    } catch (error) {
      console.error('Error downloading tier resources:', error)
      addNotification({
        message: 'An error occurred while starting downloads.',
        type: 'error',
      })
    }
  }

  const closeTierModal = () => {
    setTierModalOpen(false)
    setActiveCategory(null)
  }

  // Wikipedia selection handlers
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
              ? 'Wikipedia removed successfully'
              : 'Wikipedia download started',
          type: 'success',
        })
        invalidateDownloads()
        queryClient.invalidateQueries({ queryKey: [WIKIPEDIA_STATE_KEY] })
        setSelectedWikipedia(null)
      } else {
        addNotification({
          message: result?.message || 'Failed to change Wikipedia selection',
          type: 'error',
        })
      }
    } catch (error) {
      console.error('Error selecting Wikipedia:', error)
      addNotification({
        message: 'An error occurred while changing Wikipedia selection',
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
        message: 'Successfully refreshed content collections.',
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: [CURATED_CATEGORIES_KEY] })
      queryClient.invalidateQueries({ queryKey: [WIKIPEDIA_STATE_KEY] })
    },
  })

  // Custom library management
  const addLibraryMutation = useMutation({
    mutationFn: () => api.addCustomLibrary(newLibraryName.trim(), newLibraryUrl.trim()),
    onSuccess: () => {
      addNotification({ message: 'Custom library added.', type: 'success' })
      queryClient.invalidateQueries({ queryKey: [CUSTOM_LIBRARIES_KEY] })
      setNewLibraryName('')
      setNewLibraryUrl('')
    },
    onError: () => {
      addNotification({ message: 'Failed to add custom library.', type: 'error' })
    },
  })

  const removeLibraryMutation = useMutation({
    mutationFn: (id: number) => api.removeCustomLibrary(id),
    onSuccess: (_data, id) => {
      addNotification({ message: 'Custom library removed.', type: 'success' })
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
      <Head title="Content Explorer | Project N.O.M.A.D." />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">Content Explorer</h1>
              <p className="text-text-muted">Browse and download content for offline reading!</p>
            </div>
          </div>
          {!isOnline && (
            <Alert
              title="No internet connection. You may not be able to download files."
              message=""
              type="warning"
              variant="solid"
              className="!mt-6"
            />
          )}
          {!isInstalled && (
            <Alert
              title="The Kiwix application is not installed. Please install it to view downloaded content files."
              type="warning"
              variant="solid"
              className="!mt-6"
            />
          )}
          <div className="mt-8 mb-6 flex items-center justify-between">
            <StyledSectionHeader title="Curated Content" className="!mb-0" />
            <StyledButton
              onClick={() => refreshManifests.mutate()}
              disabled={refreshManifests.isPending || !isOnline}
              icon="IconRefresh"
            >
              Force Refresh Collections
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

          {/* Tiered Category Collections */}
          <div className="flex items-center gap-3 mt-8 mb-4">
            <div className="w-10 h-10 rounded-full bg-surface-primary border border-border-subtle flex items-center justify-center shadow-sm">
              <IconBooks className="w-6 h-6 text-text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-text-primary">Additional Content</h3>
              <p className="text-sm text-text-muted">Curated collections for offline reference</p>
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

              {/* Tier Selection Modal */}
              <TierSelectionModal
                isOpen={tierModalOpen}
                onClose={closeTierModal}
                category={activeCategory}
                selectedTierSlug={activeCategory?.installedTierSlug}
                onSelectTier={handleTierSelect}
              />
            </>
          ) : (
            <p className="text-text-muted mt-4">No curated content categories available.</p>
          )}

          {/* Kiwix Library / Custom Library Browser */}
          <div className="mt-12 mb-4 flex items-center justify-between">
            <StyledSectionHeader title="Browse the Kiwix Library" className="!mb-0" />
            <StyledButton
              onClick={() => setManageModalOpen(true)}
              disabled={!isOnline}
              icon="IconLibrary"
            >
              {hasCustomLibraries ? 'Manage Custom Libraries' : 'Add Custom Library'}
            </StyledButton>
          </div>

          {/* Source selector dropdown */}
          {hasCustomLibraries && (
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm font-medium text-text-secondary">Source:</label>
              <select
                value={selectedSource === 'default' ? 'default' : String(selectedSource)}
                onChange={(e) => handleSourceChange(e.target.value)}
                className="rounded-md border border-border-default bg-surface-primary text-text-primary px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-desert-green"
              >
                <option value="default">Default (Kiwix)</option>
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
                  placeholder="Search available ZIM files..."
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
                data={flatData.map((i, idx) => {
                  const row = virtualizer.getVirtualItems().find((v) => v.index === idx)
                  return {
                    ...i,
                    height: `${row?.size || 48}px`,
                    translateY: row?.start || 0,
                  }
                })}
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
                  },
                  {
                    accessor: 'updated',
                    render(record) {
                      return new Intl.DateTimeFormat('en-US', {
                        dateStyle: 'medium',
                      }).format(new Date(record.updated))
                    },
                  },
                  {
                    accessor: 'size_bytes',
                    title: 'Size',
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
                            Download
                          </StyledButton>
                        </div>
                      )
                    },
                  },
                ]}
                className="relative overflow-x-auto overflow-y-auto h-[600px] w-full mt-4"
                tableBodyStyle={{
                  position: 'relative',
                  height: `${virtualizer.getTotalSize()}px`,
                }}
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
              {/* Breadcrumb navigation */}
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
                  title="Could not fetch directory listing from this URL."
                  message="The server may not support directory browsing, or the URL may be incorrect."
                  type="error"
                  variant="solid"
                />
              )}

              {!isBrowsing && !browseError && browseData && (
                <div className="bg-surface-primary rounded-lg border border-border-subtle overflow-hidden relative" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                  {browseData.directories.length === 0 && browseData.files.length === 0 ? (
                    <p className="text-text-muted p-6 text-center">
                      No directories or ZIM files found at this location.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-subtle bg-surface-secondary sticky top-0 z-10">
                          <th className="text-left px-4 py-3 font-medium text-text-secondary">Name</th>
                          <th className="text-right px-4 py-3 font-medium text-text-secondary w-32">Size</th>
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
                                Download
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
            title="Manage Custom Libraries"
            open={manageModalOpen}
            onCancel={() => setManageModalOpen(false)}
            cancelText="Close"
          >
            <div className="space-y-6">
              <div>
                <p className="text-sm text-text-muted mb-4">
                  Add Kiwix mirrors or other ZIM file sources for faster downloads.
                </p>

                {/* Existing libraries */}
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
                              <span className="ml-2 text-xs text-text-muted font-normal">(built-in)</span>
                            )}
                          </p>
                          <p className="text-xs text-text-muted truncate">{lib.base_url}</p>
                        </div>
                        {!lib.is_default && (
                          <button
                            onClick={() => removeLibraryMutation.mutate(lib.id)}
                            className="ml-3 p-1.5 text-text-muted hover:text-red-500 transition-colors rounded"
                            title="Remove library"
                          >
                            <IconTrash className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new library form */}
                <div className="space-y-3">
                  <Input
                    name="library-name"
                    label="Library Name"
                    placeholder="e.g., Debian Mirror"
                    value={newLibraryName}
                    onChange={(e) => setNewLibraryName(e.target.value)}
                  />
                  <Input
                    name="library-url"
                    label="Base URL"
                    placeholder="e.g., https://cdimage.debian.org/mirror/kiwix.org/zim/"
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
                    Add Library
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
