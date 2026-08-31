import { useEffect, useState } from 'react'
import StyledModal from './StyledModal'
import Input from './inputs/Input'
import LinkTileIconPicker from './LinkTileIconPicker'
import DynamicIcon, { DynamicIconName } from './DynamicIcon'
import { normalizeCustomUrl } from '~/lib/navigation'
import { DEFAULT_LINK_TILE_ICON } from '../../constants/link_tile_icons'
import { DEFAULT_LINK_TILE_COLOR, LINK_TILE_COLORS } from '../../constants/link_tile_colors'
import { ServiceSlim } from '../../types/services'
import api from '~/lib/api'

interface LinkTileModalProps {
  open: boolean
  /** The tile being edited, or null when creating a new one. */
  tile: ServiceSlim | null
  onClose: () => void
  onSaved: () => void
  showError: (msg: string) => void
}

/**
 * Create or edit a dashboard link: a shortcut to something the user already runs.
 *
 * One URL field rather than separate host/port/path. People paste URLs, and it
 * gets https and sub-paths for free. A bare "192.168.1.50:8080" is accepted and
 * gains http:// automatically, which is what most LAN devices need.
 */
export default function LinkTileModal({
  open,
  tile,
  onClose,
  onSaved,
  showError,
}: LinkTileModalProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState<string>(DEFAULT_LINK_TILE_ICON)
  const [color, setColor] = useState<string>(DEFAULT_LINK_TILE_COLOR)
  const [submitting, setSubmitting] = useState(false)

  const isEdit = Boolean(tile)

  useEffect(() => {
    if (!open) return
    setName(tile?.friendly_name ?? '')
    setUrl(tile?.custom_url ?? '')
    setDescription(tile?.description ?? '')
    setIcon(tile?.icon ?? DEFAULT_LINK_TILE_ICON)
    setColor(tile?.link_color ?? DEFAULT_LINK_TILE_COLOR)
  }, [open, tile])

  const trimmedName = name.trim()
  const trimmedUrl = url.trim()
  const normalized = normalizeCustomUrl(url)
  const urlInvalid = trimmedUrl.length > 0 && !normalized
  const canSave = trimmedName.length > 0 && Boolean(normalized)

  async function handleSave() {
    if (!canSave) return
    setSubmitting(true)

    const payload = {
      friendly_name: trimmedName,
      url: trimmedUrl,
      description: description.trim() ? description.trim() : null,
      icon,
      link_color: color,
    }

    const result = isEdit
      ? await api.updateLinkTile({ ...payload, service_name: tile!.service_name })
      : await api.createLinkTile(payload)

    setSubmitting(false)

    if (!result?.success) {
      showError(
        isEdit
          ? 'Failed to save this link.'
          : 'Failed to add this link. A link with that name may already exist.'
      )
      return
    }
    onSaved()
  }

  return (
    <StyledModal
      title={isEdit ? 'Edit Link' : 'Add a Link'}
      open={open}
      onCancel={onClose}
      onClose={onClose}
      cancelText="Cancel"
      onConfirm={handleSave}
      confirmVariant="primary"
      confirmText={isEdit ? 'Save' : 'Add Link'}
      confirmIcon="IconCheck"
      confirmLoading={submitting}
      confirmDisabled={!canSave}
    >
      <div className="space-y-4 text-sm">
        <p className="text-text-muted">
          Add a shortcut to something you already run, on this machine or anywhere else on your
          network. NOMAD does not manage it, it just puts a button on your dashboard.
        </p>

        <Input
          name="linkName"
          label="Name"
          placeholder="Living room NAS"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />

        <div>
          <Input
            name="linkUrl"
            label="URL"
            placeholder="192.168.1.50:8080"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={urlInvalid}
          />
          {urlInvalid ? (
            <p className="mt-1.5 text-xs text-red-500">
              Enter a valid URL, for example 192.168.1.50:8080 or https://nas.local.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-text-muted">
              Opens as:{' '}
              <span className="font-mono break-all text-text-primary">
                {normalized || 'not set yet'}
              </span>
            </p>
          )}
        </div>

        <Input
          name="linkDescription"
          label="Description (optional)"
          placeholder="Photos and backups"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
        />

        <div>
          <p className="mb-1.5 flex items-center gap-2 font-medium text-text-primary">
            Icon
            <span className="text-text-secondary">
              <DynamicIcon icon={icon as DynamicIconName} className="!size-5" />
            </span>
          </p>
          <LinkTileIconPicker value={icon} onChange={setIcon} />
        </div>

        <div>
          <p className="mb-1.5 font-medium text-text-primary">Color</p>
          <div className="flex items-center gap-2">
            {LINK_TILE_COLORS.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.label}
                aria-label={option.label}
                aria-pressed={color === option.id}
                onClick={() => setColor(option.id)}
                className={`h-7 w-7 rounded transition-transform ${option.swatch} ${
                  color === option.id
                    ? 'scale-110 ring-2 ring-offset-2 ring-text-primary'
                    : 'opacity-70 hover:opacity-100'
                }`}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            Links stay outlined rather than filled whichever color you pick, so they
            are distinguishable from apps NOMAD manages.
          </p>
        </div>
      </div>
    </StyledModal>
  )
}
