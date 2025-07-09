import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import api from '~/lib/api'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import { Head } from '@inertiajs/react'
import { ListRemoteZimFilesResponse, RemoteZimFileEntry } from '../../../../types/zim'
import { formatBytes } from '~/lib/util'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'

export default function ZimRemoteExplorer() {
  const tableParentRef = useRef<HTMLDivElement>(null)
  const { openModal, closeAllModals } = useModals()
  const { data, fetchNextPage, isFetching, isLoading } =
    useInfiniteQuery<ListRemoteZimFilesResponse>({
      queryKey: ['remote-zim-files'],
      queryFn: async ({ pageParam = 0 }) => {
        const pageParsed = parseInt((pageParam as number).toString(), 10)
        const start = isNaN(pageParsed) ? 0 : pageParsed * 12
        const res = await api.listRemoteZimFiles({ start, count: 12 })
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

  const flatData = useMemo(() => data?.pages.flatMap((page) => page.items) || [], [data])
  const hasMore = useMemo(() => data?.pages[data.pages.length - 1]?.has_more || false, [data])

  const fetchOnBottomReached = useCallback(
    (parentRef?: HTMLDivElement | null) => {
      if (parentRef) {
        const { scrollHeight, scrollTop, clientHeight } = parentRef
        //once the user has scrolled within 200px of the bottom of the table, fetch more data if we can
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
          Are you sure you want to download <strong>{record.title}</strong>? It may take some time
          for it to be available depending on the file size and your internet connection.
        </p>
      </StyledModal>,
      'confirm-download-file-modal'
    )
  }

  async function downloadFile(record: RemoteZimFileEntry) {
    try {
      await api.downloadRemoteZimFile(record.download_url)
    } catch (error) {
      console.error('Error downloading file:', error)
    }
  }

  return (
    <SettingsLayout>
      <Head title="ZIM Remote Explorer | Project N.O.M.A.D." />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <h1 className="text-4xl font-semibold mb-4">ZIM Remote Explorer</h1>
          <p className="text-gray-500 mb-2">
            Browse and download remote ZIM files from the Kiwix repository!
          </p>
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
                render(record) {
                  return formatBytes(record.size_bytes)
                },
              },
              {
                accessor: 'actions',
                render(record, index) {
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
            className="relative overflow-x-auto overflow-y-auto h-[600px] w-full "
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
        </main>
      </div>
    </SettingsLayout>
  )
}
