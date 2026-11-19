import { useEffect, useState } from 'react'
import {
  IconCheck,
  IconDownload,
  IconPencil,
  IconPlus,
  IconStack2,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react'

import type { MarkerLayer } from '~/hooks/useMarkerLayers'

interface LayersSectionProps {
  layers: MarkerLayer[]
  activeLayerId: number | null
  onSelect: (id: number) => void
  onToggleVisible: (id: number, visible: boolean) => void
  onCreate: (name: string) => Promise<unknown>
  onRename: (id: number, name: string) => Promise<unknown>
  onDelete: (id: number) => Promise<string | null>
  exportUrl: (layerId?: number) => string
  onImport: () => void
}

const iconButton =
  'shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary'

// Pin layers (#1387): show/hide, pick where new pins go, and move pins between
// installs one layer at a time.
export default function LayersSection({
  layers,
  activeLayerId,
  onSelect,
  onToggleVisible,
  onCreate,
  onRename,
  onDelete,
  exportUrl,
  onImport,
}: LayersSectionProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  // Deleting a layer deletes its pins, so the trash icon arms rather than deletes.
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (pendingDeleteId !== null && !layers.some((l) => l.id === pendingDeleteId)) {
      setPendingDeleteId(null)
    }
  }, [layers, pendingDeleteId])

  const submitCreate = async () => {
    const name = newName.trim()
    if (!name) return
    await onCreate(name)
    setNewName('')
    setCreating(false)
  }

  const submitRename = async (id: number) => {
    const name = editName.trim()
    if (name) await onRename(id, name)
    setEditingId(null)
  }

  const onlyOneLayer = layers.length <= 1

  return (
    <div className="border-b border-border-subtle px-3 py-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        <IconStack2 size={14} className="text-text-muted" />
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Layers</span>
      </div>

      <ul className="space-y-0.5">
        {layers.map((layer) => {
          const active = layer.id === activeLayerId
          const confirmingDelete = pendingDeleteId === layer.id

          return (
            <li
              key={layer.id}
              className={`group flex items-center gap-1.5 rounded px-1.5 py-1 ${
                active ? 'bg-desert-green/10' : 'hover:bg-surface-secondary'
              }`}
            >
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={(e) => onToggleVisible(layer.id, e.target.checked)}
                className="h-3.5 w-3.5 shrink-0 accent-desert-green"
                aria-label={layer.visible ? `Hide layer ${layer.name}` : `Show layer ${layer.name}`}
                title={layer.visible ? 'Hide this layer' : 'Show this layer'}
              />

              {editingId === layer.id ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault()
                    submitRename(layer.id)
                  }}
                >
                  <input
                    autoFocus
                    value={editName}
                    maxLength={100}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setEditingId(null)}
                    className="min-w-0 flex-1 rounded border border-border-default bg-surface-primary px-1.5 py-0.5 text-sm text-text-primary focus:border-desert-green focus:outline-none"
                    aria-label="Layer name"
                  />
                  <button type="submit" className={iconButton} title="Save name" aria-label="Save name">
                    <IconCheck size={14} />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(layer.id)}
                  className="min-w-0 flex-1 text-left"
                  title={active ? 'New pins go into this layer' : 'Add new pins to this layer'}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`truncate text-sm ${active ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}
                    >
                      {layer.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-muted">{layer.markerCount}</span>
                  </span>
                </button>
              )}

              {confirmingDelete ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      const error = await onDelete(layer.id)
                      setDeleteError(error)
                      setPendingDeleteId(null)
                    }}
                    className="rounded bg-desert-red px-1.5 py-0.5 text-[11px] font-medium text-white transition-colors hover:brightness-110"
                  >
                    Delete {layer.markerCount} {layer.markerCount === 1 ? 'pin' : 'pins'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(null)}
                    className={iconButton}
                    title="Cancel"
                    aria-label="Cancel"
                  >
                    <IconX size={14} />
                  </button>
                </span>
              ) : (
                editingId !== layer.id && (
                  <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(layer.id)
                        setEditName(layer.name)
                      }}
                      className={iconButton}
                      title="Rename layer"
                      aria-label={`Rename layer ${layer.name}`}
                    >
                      <IconPencil size={14} />
                    </button>
                    <a
                      href={exportUrl(layer.id)}
                      download
                      className={iconButton}
                      title="Export this layer"
                      aria-label={`Export layer ${layer.name}`}
                    >
                      <IconDownload size={14} />
                    </a>
                    <button
                      type="button"
                      disabled={onlyOneLayer}
                      onClick={() => {
                        setDeleteError(null)
                        setPendingDeleteId(layer.id)
                      }}
                      className={`${iconButton} hover:text-desert-red disabled:cursor-not-allowed disabled:opacity-40`}
                      title={onlyOneLayer ? 'You need at least one layer' : 'Delete layer and its pins'}
                      aria-label={`Delete layer ${layer.name}`}
                    >
                      <IconTrash size={14} />
                    </button>
                  </span>
                )
              )}
            </li>
          )
        })}
      </ul>

      {deleteError && <p className="mt-1 text-xs text-desert-red">{deleteError}</p>}

      {creating ? (
        <form
          className="mt-1.5 flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            submitCreate()
          }}
        >
          <input
            autoFocus
            value={newName}
            maxLength={100}
            placeholder="Layer name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
            className="min-w-0 flex-1 rounded border border-border-default bg-surface-primary px-1.5 py-0.5 text-sm text-text-primary placeholder:text-text-muted focus:border-desert-green focus:outline-none"
            aria-label="New layer name"
          />
          <button type="submit" className={iconButton} title="Create layer" aria-label="Create layer">
            <IconCheck size={14} />
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className={iconButton}
            title="Cancel"
            aria-label="Cancel"
          >
            <IconX size={14} />
          </button>
        </form>
      ) : (
        <div className="mt-1.5 flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <IconPlus size={13} /> New layer
          </button>
          <a
            href={exportUrl()}
            download
            className="flex items-center gap-1 rounded px-1.5 py-1 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <IconDownload size={13} /> Export all
          </a>
          <button
            type="button"
            onClick={onImport}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <IconUpload size={13} /> Import
          </button>
        </div>
      )}
    </div>
  )
}
