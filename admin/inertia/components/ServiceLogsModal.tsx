import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import StyledModal from './StyledModal'
import api from '~/lib/api'

interface ServiceLogsModalProps {
  serviceName: string
  friendlyName: string
  open: boolean
  onClose: () => void
}

/** Shows the tail of a service container's logs with a manual refresh. */
export default function ServiceLogsModal({
  serviceName,
  friendlyName,
  open,
  onClose,
}: ServiceLogsModalProps) {
  const { t } = useTranslation()
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const res = await api.getServiceLogs(serviceName, 500)
    setLogs(res?.success ? res.logs || '' : t('common.service_logs_modal.error_load'))
    setLoading(false)
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serviceName])

  return (
    <StyledModal
      title={t('common.service_logs_modal.title', { name: friendlyName })}
      open={open}
      onCancel={onClose}
      cancelText={t('common.service_logs_modal.close')}
      onConfirm={load}
      confirmText={t('common.service_logs_modal.refresh')}
      confirmIcon="IconRefresh"
      confirmVariant="outline"
      confirmLoading={loading}
      large
    >
      <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-[60vh] overflow-auto bg-surface-secondary rounded-md p-3 text-text-primary text-left">
        {logs || (loading ? t('common.service_logs_modal.loading') : t('common.service_logs_modal.no_output'))}
      </pre>
    </StyledModal>
  )
}
