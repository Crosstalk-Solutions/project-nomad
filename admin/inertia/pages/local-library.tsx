import { Head } from '@inertiajs/react'
import { useEffect, useMemo, useState } from 'react'
import {
  IconBook,
  IconDownload,
  IconFileText,
  IconFileTypePdf,
  IconRefresh,
  IconSearch,
  IconUpload,
} from '@tabler/icons-react'
import AppLayout from '~/layouts/AppLayout'
import StyledButton from '~/components/StyledButton'
import Input from '~/components/inputs/Input'
import api from '~/lib/api'
import { formatBytes } from '~/lib/util'
import type { LocalLibraryFile, LocalLibraryPreviewResponse } from '../../types/local_library'
import { useNotifications } from '~/context/NotificationContext'

function fileIcon(type: LocalLibraryFile['type']) {
  if (type === 'pdf') return <IconFileTypePdf className="h-8 w-8" />
  if (type === 'epub') return <IconBook className="h-8 w-8" />
  return <IconFileText className="h-8 w-8" />
}

export default function LocalLibraryPage() {
  const { addNotification } = useNotifications()
  const [files, setFiles] = useState<LocalLibraryFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<LocalLibraryFile | null>(null)
  const [preview, setPreview] = useState<LocalLibraryPreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    const result = await api.listLocalLibraryFiles()
    setFiles(result?.files ?? [])
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  const filteredFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return files
    return files.filter((file) => file.displayName.toLowerCase().includes(normalized))
  }, [files, query])

  async function selectFile(file: LocalLibraryFile) {
    setSelected(file)
    setPreview(null)
    if (file.type === 'epub' || file.type === 'text') {
      setPreviewLoading(true)
      const result = await api.previewLocalLibraryFile(file.name)
      setPreview(result ?? null)
      setPreviewLoading(false)
    }
  }

  async function uploadFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    const result = await api.uploadLocalLibraryFile(file)
    if (result?.files) {
      setFiles(result.files)
      addNotification({ message: 'File added to Local Library.', type: 'success' })
    }
    setUploading(false)
  }

  async function deleteFile(file: LocalLibraryFile) {
    await api.deleteLocalLibraryFile(file.name)
    if (selected?.name === file.name) {
      setSelected(null)
      setPreview(null)
    }
    await refresh()
  }

  async function indexFile(file: LocalLibraryFile) {
    const result = await api.indexLocalLibraryFile(file.name)
    addNotification({
      message: result?.message ?? 'Indexing queued for this file.',
      type: 'success',
    })
  }

  return (
    <AppLayout>
      <Head title="Local Library | Project N.O.M.A.D." />
      <div className="flex h-[calc(100vh-5rem)] min-h-[720px] bg-surface-primary">
        <aside className="w-full max-w-sm border-r border-border-subtle bg-surface-secondary flex flex-col">
          <div className="p-4 border-b border-border-subtle">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-text-primary">Local Library</h1>
                <p className="text-sm text-text-muted">PDFs, eBooks, manuals, and field notes.</p>
              </div>
              <StyledButton variant="ghost" icon="IconRefresh" size="sm" onClick={refresh}>
                Refresh
              </StyledButton>
            </div>
            <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-desert-green p-4 text-sm font-semibold text-desert-green hover:bg-desert-sand">
              <IconUpload className="h-5 w-5" />
              {uploading ? 'Uploading...' : 'Add Files'}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.epub,.mobi,.azw,.azw3,.txt,.md,.rtf,.docx"
                onChange={(event) => uploadFile(event.target.files?.[0])}
                disabled={uploading}
              />
            </label>
            <Input
              name="library-search"
              label=""
              placeholder="Search library"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-4"
              leftIcon={<IconSearch className="h-5 w-5 text-text-muted" />}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-text-muted">
                <IconRefresh className="mr-2 h-5 w-5 animate-spin" />
                Loading library
              </div>
            ) : filteredFiles.length === 0 ? (
              <p className="p-4 text-sm text-text-muted">No local library files found.</p>
            ) : (
              <div className="space-y-2">
                {filteredFiles.map((file) => (
                  <button
                    key={file.name}
                    type="button"
                    onClick={() => selectFile(file)}
                    className={`w-full rounded border p-3 text-left transition-colors ${
                      selected?.name === file.name
                        ? 'border-desert-green bg-white'
                        : 'border-border-subtle bg-surface-primary hover:border-desert-green'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-desert-green">{fileIcon(file.type)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-text-primary">
                          {file.displayName}
                        </span>
                        <span className="text-xs uppercase text-text-muted">{file.type}</span>
                        <span className="ml-2 text-xs text-text-muted">
                          {formatBytes(file.size)}
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <IconBook className="mx-auto mb-4 h-16 w-16 text-desert-green" />
                <h2 className="text-2xl font-semibold text-text-primary">Choose a file</h2>
                <p className="mt-2 text-text-muted">
                  PDFs open here without leaving Command Center.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold text-text-primary">
                    {selected.displayName}
                  </h2>
                  <p className="text-sm text-text-muted">
                    {selected.type.toUpperCase()} • {formatBytes(selected.size)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.canIndex && (
                    <StyledButton
                      variant="action"
                      icon="IconBrain"
                      onClick={() => indexFile(selected)}
                    >
                      Index for AI
                    </StyledButton>
                  )}
                  <a href={selected.downloadUrl}>
                    <StyledButton variant="secondary">
                      <IconDownload className="mr-2 h-4 w-4" />
                      Download
                    </StyledButton>
                  </a>
                  <StyledButton
                    variant="danger"
                    icon="IconTrash"
                    onClick={() => deleteFile(selected)}
                  >
                    Delete
                  </StyledButton>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden bg-white">
                {selected.type === 'pdf' && selected.viewUrl ? (
                  <iframe
                    title={selected.displayName}
                    src={selected.viewUrl}
                    className="h-full w-full"
                  />
                ) : selected.type === 'epub' || selected.type === 'text' ? (
                  <article className="h-full overflow-y-auto px-8 py-6 text-text-primary">
                    {previewLoading ? (
                      <p className="text-text-muted">Loading preview...</p>
                    ) : (
                      <div className="mx-auto max-w-4xl whitespace-pre-wrap leading-7">
                        {preview?.text || 'No readable text preview was found.'}
                      </div>
                    )}
                  </article>
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-text-muted">
                    <div>
                      <IconFileText className="mx-auto mb-4 h-12 w-12" />
                      <p>
                        This file is stored locally and can be downloaded, but preview is not
                        available.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </AppLayout>
  )
}
