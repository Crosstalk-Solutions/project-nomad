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
import { IconSearch } from '@tabler/icons-react'
import useDebounce from '~/hooks/useDebounce'
import CuratedCollectionCard from '~/components/CuratedCollectionCard'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import { CuratedCollectionWithStatus } from '../../../../types/downloads'
import useDownloads from '~/hooks/useDownloads'
import ActiveDownloads from '~/components/ActiveDownloads'

const CURATED_COLLECTIONS_KEY = 'curated-zim-collections'

export default function ZimRemoteExplorer() {
  const queryClient = useQueryClient()
  const tableParentRef = useRef<HTMLDivElement>(null)

  const { openModal, closeAllModals } = useModals()
  const { addNotification } = useNotifications()
  const { isOnline } = useInternetStatus()
  const { isInstalled } = useServiceInstalledStatus('nomad_kiwix_serve')
  const { debounce } = useDebounce()

  const [query, setQuery] = useState('')
  const [queryUI, setQueryUI] = useState('')

  const debouncedSetQuery = debounce((val: string) => {
    setQuery(val)
  }, 400)

  const { data: curatedCollections } = useQuery({
    queryKey: [CURATED_COLLECTIONS_KEY],
    queryFn: () => api.listCuratedZimCollections(),
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

  async function confirmDownload(record: RemoteZimFileEntry | CuratedCollectionWithStatus) {
    const isCollection = 'resources' in record
    openModal(
      <StyledModal
        title="Confirm Download?"
        onConfirm={() => {
          if (isCollection) {
            if (record.all_downloaded) {
              addNotification({
                message: `All resources in the collection "${record.name}" have already been downloaded.`,
                type: 'info',
              })
              return
            }
            downloadCollection(record)
          } else {
            downloadFile(record)
          }
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
          <strong>{isCollection ? record.name : record.title}</strong>? It may take some time for it
          to be available depending on the file size and your internet connection. The Kiwix
          application will be restarted after the download is complete.
        </p>
      </StyledModal>,
      'confirm-download-file-modal'
    )
  }

  async function downloadFile(record: RemoteZimFileEntry) {
    try {
      await api.downloadRemoteZimFile(record.download_url)
      invalidateDownloads()
    } catch (error) {
      console.error('Error downloading file:', error)
    }
  }

  async function downloadCollection(record: CuratedCollectionWithStatus) {
    try {
      await api.downloadZimCollection(record.slug)
      invalidateDownloads()
    } catch (error) {
      console.error('Error downloading collection:', error)
    }
  }

  const fetchLatestCollections = useMutation({
    mutationFn: () => api.fetchLatestZimCollections(),
    onSuccess: () => {
      addNotification({
        message: 'Successfully fetched the latest ZIM collections.',
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: [CURATED_COLLECTIONS_KEY] })
    },
  })

  return (
    <SettingsLayout>
      <Head title="ZIM Remote Explorer | Project N.O.M.A.D." />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">ZIM Remote Explorer</h1>
              <p className="text-gray-500">Browse and download ZIM files for offline reading!</p>
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
              title="The Kiwix application is not installed. Please install it to view downloaded ZIM files"
              type="warning"
              variant="solid"
              className="!mt-6"
            />
          )}
          <StyledSectionHeader title="Curated ZIM Collections" className="mt-8 !mb-4" />
          <StyledButton
            onClick={() => fetchLatestCollections.mutate()}
            disabled={fetchLatestCollections.isPending}
            icon="CloudArrowDownIcon"
          >
            Fetch Latest Collections
          </StyledButton>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {curatedCollections?.map((collection) => (
              <CuratedCollectionCard
                key={collection.slug}
                collection={collection}
                onClick={(collection) => confirmDownload(collection)}
                size="large"
              />
            ))}
            {curatedCollections && curatedCollections.length === 0 && (
              <p className="text-gray-500">No curated collections available.</p>
            )}
          </div>
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
                        icon={'ArrowDownTrayIcon'}
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
