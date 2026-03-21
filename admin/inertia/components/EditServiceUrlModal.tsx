import { useState } from 'react'
import { ServiceSlim } from '../../types/services'
import StyledModal from './StyledModal'
import Input from './inputs/Input'
import { IconLink } from '@tabler/icons-react'

interface EditServiceUrlModalProps {
  record: ServiceSlim
  onCancel: () => void
  onSave: (uiLocation: string) => void
}

export default function EditServiceUrlModal({ record, onCancel, onSave }: EditServiceUrlModalProps) {
  const [uiLocation, setUiLocation] = useState(record.ui_location || '')

  return (
    <StyledModal
      title="Edit Service URL"
      onConfirm={() => onSave(uiLocation)}
      onCancel={onCancel}
      open={true}
      confirmText="Save"
      cancelText="Cancel"
      confirmVariant="primary"
      icon={<IconLink className="h-12 w-12 text-desert-green" />}
    >
      <div className="space-y-4">
        <p className="text-text-primary">
          Set the URL for <strong>{record.friendly_name || record.service_name}</strong>.
        </p>
        <p className="text-sm text-text-muted">
          Enter a full URL (e.g. <code className="bg-surface-secondary px-1 rounded">https://myservice.example.com</code>) to support reverse proxy setups, or a bare port number (e.g. <code className="bg-surface-secondary px-1 rounded">8080</code>) for direct access.
        </p>
        <Input
          name="ui_location"
          label="Service URL or Port"
          value={uiLocation}
          onChange={(e) => setUiLocation(e.target.value)}
          placeholder="https://myservice.example.com or 8080"
        />
      </div>
    </StyledModal>
  )
}
