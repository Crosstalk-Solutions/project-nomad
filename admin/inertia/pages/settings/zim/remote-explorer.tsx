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
import { IconSearch, IconBooks } from '@tabler/icons-react'
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

  const { data, fetchNextPage, isFetching, isLoading } =
    useInfiniteQuery<ListRemoteZimFilesResponse>({
      queryKey: ['remote-zim-files', query],
      queryFn: async ({ pageParam = 0 }) => {
        const pageParsed = parseInt((pageParam as number).toString(), 10)
        const start = isNaN(pageParsed) ? 0 : pageParsed * 12
        const res = await api.listRemoteZimFiles({ start, count: 12, query: query || undefined })
        if (!res) {
          throw new Error('Failed to fetch remote ZIM files.')
        }
        return res.data
      },
      initialPageParam: 0,
      getNextPageParam: (_lastPage, pages) => {
        if (!_lastPage.has_more) {
          return undefined // No more pages to fetch
        }
        return pages.length
      },
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
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
        //once the user has scrolled within 200px of the bottom of the table, fetch more data if we can
        if (
          scrollHeight - scrollTop - clientHeight < 200 &&
          !isFetching &&
          hasMore &&
          flatData.length > 0
        ) {
          fetchNextPage()
        }
      }
    },
    [fetchNextPage, isFetching, hasMore, flatData.length]
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
        <p className="text-gray-700">
          Are you sure you want to download{' '}
          <strong>{record.title}</strong>? It may take some time for it
          to be available depending on the file size and your internet connection. The Kiwix
          application will be restarted after the download is complete.
        </p>
      </StyledModal>,
      'confirm-download-file-modal'
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
    },
  })

  return (
    <SettingsLayout>
      <Head title="Content Explorer | Project N.O.M.A.D." />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">Content Explorer</h1>
              <p className="text-gray-500">Browse and download content for offline reading!</p>
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
          <StyledSectionHeader title="Curated Content Collections" className="mt-8 !mb-4" />
          <StyledButton
            onClick={() => refreshManifests.mutate()}
            disabled={refreshManifests.isPending}
            icon="IconCloudDownload"
          >
            Refresh Collections
          </StyledButton>

          {/* Wikipedia Selector */}
          {isLoadingWikipedia ? (
            <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-desert-green"></div>
              </div>
            </div>
          ) : wikipediaState && wikipediaState.options.length > 0 ? (
            <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
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
            <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
              <IconBooks className="w-6 h-6 text-gray-700" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900">Additional Content</h3>
              <p className="text-sm text-gray-500">Curated collections for offline reference</p>
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
            <p className="text-gray-500 mt-4">No curated content categories available.</p>
          )}
          <StyledSectionHeader title="Browse the Kiwix Library" className="mt-12 mb-4" />
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
              leftIcon={<IconSearch className="w-5 h-5 text-gray-400" />}
            />
          </div>
          <StyledTable<RemoteZimFileEntry & { actions?: any }>
            data={flatData.map((i, idx) => {
              const row = virtualizer.getVirtualItems().find((v) => v.index === idx)
              return {
                ...i,
                height: `${row?.size || 48}px`, // Use the size from the virtualizer
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
          <ActiveDownloads filetype="zim" withHeader />
        </main>
      </div>
    </SettingsLayout>
  )
}
