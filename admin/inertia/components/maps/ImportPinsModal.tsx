import { useEffect, useState } from 'react'
import { IconUpload } from '@tabler/icons-react'

import StyledModal from '~/components/StyledModal'
import api from '~/lib/api'
import type { MarkerLayer } from '~/hooks/useMarkerLayers'
import type { ImportMarkerLayersResponse, MarkerLayerImportMode } from '../../../types/maps'

interface ImportPinsModalProps {
  open: boolean
  layers: MarkerLayer[]
  activeLayerId: number | null
  onClose: () => void
  onImported: (result: ImportMarkerLayersResponse) => void
}

const MODES: Array<{ value: MarkerLayerImportMode; label: string; hint: string }> = [
  {
    value: 'new',
    label: 'Add as a new layer',
    hint: 'Your existing pins are not touched.',
  },
  {
    value: 'merge',
    label: 'Merge into an existing layer',
    hint: 'Pins already in that layer (same name and location) are skipped.',
  },
  {
    value: 'replace',
    label: 'Replace an existing layer',
    hint: "Deletes that layer's pins, then imports the file.",
  },
]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function describeImport(result: ImportMarkerLayersResponse): string {
  const what = [plural(result.imported_pins, 'pin')]
  if (result.imported_routes > 0) what.push(plural(result.imported_routes, 'route'))
  const into = result.layers.map((l) => `'${l.name}'`).join(', ')
  let text = `Imported ${what.join(' and ')} into ${into}.`
  if (result.skipped_duplicates > 0) {
    text += ` Skipped ${plural(result.skipped_duplicates, 'duplicate pin')}.`
  }
  return text
}

// Import a NOMAD pin file (#1387).
export default function ImportPinsModal({
  open,
  layers,
  activeLayerId,
  onClose,
  onImported,
}: ImportPinsModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<MarkerLayerImportMode>('new')
  const [targetLayerId, setTargetLayerId] = useState<number | null>(activeLayerId)
  const [confirmingReplace, setConfirmingReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)

  // Start fresh each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setFile(null)
    setMode('new')
    setTargetLayerId(activeLayerId)
    setConfirmingReplace(false)
    setBusy(false)
    setError(null)
    setSummary(null)
  }, [open, activeLayerId])

  const target = layers.find((l) => l.id === targetLayerId) ?? null
  const needsTarget = mode !== 'new'

  const runImport = async () => {
    if (!file) return
    if (mode === 'replace' && !confirmingReplace) {
      setConfirmingReplace(true)
      return
    }
    setBusy(true)
    setError(null)
    const response = await api.importMarkerLayers({
      file,
      mode,
      targetLayerId: needsTarget ? (target?.id ?? undefined) : undefined,
    })
    setBusy(false)
    setConfirmingReplace(false)
    if (!response.ok) {
      setError(response.message)
      return
    }
    setSummary(describeImport(response.result))
    onImported(response.result)
  }

  if (summary) {
    return (
      <StyledModal
        open={open}
        title="Import complete"
        icon={<IconUpload className="size-8 text-desert-green" />}
        confirmText="Done"
        onConfirm={onClose}
        onClose={onClose}
      >
        <p className="text-sm text-text-primary">{summary}</p>
      </StyledModal>
    )
  }

  return (
    <StyledModal
      open={open}
      title="Import pins"
      icon={<IconUpload className="size-8 text-desert-green" />}
      cancelText="Cancel"
      onCancel={onClose}
      onClose={onClose}
      confirmText={
        confirmingReplace && target ? `Delete ${plural(target.markerCount, 'pin')} and import` : 'Import'
      }
      confirmVariant={confirmingReplace ? 'danger' : 'primary'}
      confirmLoading={busy}
      confirmDisabled={!file || (needsTarget && !target)}
      onConfirm={runImport}
    >
      <div className="space-y-4 text-left">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="pin-file">
            Pin file
          </label>
          <input
            id="pin-file"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setError(null)
              setConfirmingReplace(false)
            }}
            className="block w-full text-sm text-text-secondary file:mr-3 file:rounded file:border-0 file:bg-desert-green file:px-3 file:py-1.5 file:text-sm file:text-white"
          />
          <p className="mt-1 text-xs text-text-muted">
            A .json file exported from the Pins panel of a Project NOMAD server.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-text-primary">What to do with it</legend>
          {MODES.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="import-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => {
                  setMode(option.value)
                  setConfirmingReplace(false)
                }}
                className="mt-1 accent-desert-green"
              />
              <span>
                <span className="block text-sm text-text-primary">{option.label}</span>
                <span className="block text-xs text-text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {needsTarget && (
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="pin-target">
              Layer
            </label>
            <select
              id="pin-target"
              value={targetLayerId ?? ''}
              onChange={(e) => {
                setTargetLayerId(Number(e.target.value))
                setConfirmingReplace(false)
              }}
              className="block w-full rounded border border-border-default bg-surface-primary px-2 py-1.5 text-sm text-text-primary focus:border-desert-green focus:outline-none"
            >
              {layers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name} ({plural(layer.markerCount, 'pin')})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-muted">
              If the file has more than one layer, all of its pins go into this layer.
            </p>
          </div>
        )}

        {confirmingReplace && target && (
          <p className="rounded border border-desert-red/40 bg-desert-red/10 px-3 py-2 text-sm text-text-primary">
            This deletes all {plural(target.markerCount, 'pin')} in '{target.name}' before importing.
            It can't be undone.
          </p>
        )}

        {error && (
          <p className="rounded border border-desert-red/40 bg-desert-red/10 px-3 py-2 text-sm text-text-primary">
            {error}
          </p>
        )}
      </div>
    </StyledModal>
  )
}
