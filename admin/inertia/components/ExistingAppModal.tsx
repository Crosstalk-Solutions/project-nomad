import { useEffect, useState } from 'react'
import StyledModal from './StyledModal'
import StyledButton from './StyledButton'
import api from '~/lib/api'
import Input from './inputs/Input'
import Select from './inputs/Select'
import DynamicIcon, { DynamicIconName } from './DynamicIcon'

const CATEGORY_OPTIONS = [
  { value: 'custom', label: 'Custom' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'media', label: 'Media' },
  { value: 'security', label: 'Security' },
  { value: 'networking', label: 'Networking' },
  { value: 'utility', label: 'Utility' },
  { value: 'ai', label: 'AI' },
  { value: 'education', label: 'Education' },
]

const ICON_OPTIONS = [
  { value: 'IconBrandDocker', label: 'Docker (default)' },
  { value: 'IconBox', label: 'Box' },
  { value: 'IconServer', label: 'Server' },
  { value: 'IconDatabase', label: 'Database' },
  { value: 'IconCode', label: 'Code' },
  { value: 'IconTool', label: 'Tool' },
  { value: 'IconWorld', label: 'Web' },
  { value: 'IconShieldLock', label: 'Security' },
  { value: 'IconMovie', label: 'Media' },
  { value: 'IconBook', label: 'Book' },
  { value: 'IconNotes', label: 'Notes' },
  { value: 'IconCpu', label: 'Compute' },
  { value: 'IconRobot', label: 'AI / Bot' },
  { value: 'IconWifi', label: 'Network' },
  { value: 'IconHome', label: 'Home' },
]

interface ExistingAppModalProps {
  open: boolean
  onClose: () => void
  onCreated: (serviceName: string) => void
  showError: (msg: string) => void
}

export default function ExistingAppModal({
  open,
  onClose,
  onCreated,
  showError,
}: ExistingAppModalProps) {
  const [containerName, setContainerName] = useState('')
  const [friendlyName, setFriendlyName] = useState('')
  const [category, setCategory] = useState('custom')
  const [icon, setIcon] = useState('IconBrandDocker')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setContainerName('')
    setFriendlyName('')
    setCategory('custom')
    setIcon('IconBrandDocker')
    setSubmitting(false)
  }, [open])

  async function handleSubmit() {
    if (!containerName.trim() || !friendlyName.trim()) {
      showError('Container name and display name are required.')
      return
    }

    setSubmitting(true)
    try {
      const result = await api.createExistingApp({
        container_name: containerName.trim(),
        friendly_name: friendlyName.trim(),
        category,
        icon,
      })

      if (result?.success && result.service_name) {
        onCreated(result.service_name)
      } else {
        showError(result?.message || 'Failed to add existing app.')
      }
    } catch (err: any) {
      showError(err?.message || 'Unexpected error adding existing app.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <StyledModal
      title="Add Existing App"
      open={open}
      onCancel={onClose}
      cancelText="Cancel"
      onConfirm={handleSubmit}
      confirmVariant="primary"
      confirmText="Add"
      confirmIcon="IconBrandDocker"
      confirmLoading={submitting}
      confirmDisabled={!containerName.trim() || !friendlyName.trim()}
      large
    >
      <div className="space-y-6 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <Input
            name="containerName"
            label="Container Name"
            placeholder="e.g. myapp"
            value={containerName}
            onChange={(e) => setContainerName(e.target.value)}
            required
          />
          <Input
            name="friendlyName"
            label="Display Name"
            placeholder="My App"
            value={friendlyName}
            onChange={(e) => setFriendlyName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4 items-start">
          <Select
            name="category"
            label="Category"
            helpText="Select the most relevant category for this app. This helps with visual organization and filtering."
            value={category}
            onChange={(newVal) => setCategory(newVal)}
            options={CATEGORY_OPTIONS}
          />
          <div className="flex items-end gap-2">
            <Select
              name="icon"
              label="Icon"
              helpText="Pick an icon shown on the app card."
              value={icon}
              onChange={(newVal) => setIcon(newVal)}
              options={ICON_OPTIONS}
              className="flex-1 min-w-0"
            />
            <div
              className="flex-shrink-0 flex items-center justify-center h-[42px] w-[42px] rounded-md border border-border-default bg-surface-secondary"
              title="Icon preview"
            >
              <DynamicIcon icon={icon as DynamicIconName} className="h-6 w-6 text-desert-green" />
            </div>
          </div>
        </div>

        <p className="text-xs text-text-muted">
          Add an existing Docker container by its name so it appears in the Supply Depot.
          Published containers also appear on the home dashboard.
        </p>
      </div>
    </StyledModal>
  )
}
