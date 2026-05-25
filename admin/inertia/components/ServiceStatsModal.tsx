import { useEffect, useState } from 'react'
import StyledModal from './StyledModal'
import { formatBytes } from '~/lib/util'
import api from '~/lib/api'

interface Stats {
  cpuPercent: number
  memUsageBytes: number
  memLimitBytes: number
  memPercent: number
}

interface ServiceStatsModalProps {
  serviceName: string
  friendlyName: string
  open: boolean
  onClose: () => void
}

function Bar({ percent, label, value }: { percent: number; label: string; value: string }) {
  const clamped = Math.min(100, Math.max(0, percent))
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-text-muted font-mono">{value}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            clamped > 90 ? 'bg-desert-red' : clamped > 70 ? 'bg-desert-orange' : 'bg-desert-green'
          }`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

/** Polls and displays live CPU/memory usage for a running service container. */
export default function ServiceStatsModal({
  serviceName,
  friendlyName,
  open,
  onClose,
}: ServiceStatsModalProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [running, setRunning] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function poll() {
      const res = await api.getServiceStats(serviceName)
      if (cancelled || !res) return
      setRunning(res.running)
      setStats(res.stats)
      setLoading(false)
    }

    setLoading(true)
    poll()
    const id = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [open, serviceName])

  return (
    <StyledModal
      title={`Stats — ${friendlyName}`}
      open={open}
      onCancel={onClose}
      cancelText="Close"
    >
      <div className="space-y-4 text-sm">
        {!running ? (
          <p className="text-text-muted text-center py-6">
            This app is not running. Start it to see live resource usage.
          </p>
        ) : !stats ? (
          <p className="text-text-muted text-center py-6">
            {loading ? 'Loading…' : 'No stats available.'}
          </p>
        ) : (
          <>
            <Bar label="CPU" percent={stats.cpuPercent} value={`${stats.cpuPercent.toFixed(1)}%`} />
            <Bar
              label="Memory"
              percent={stats.memPercent}
              value={`${formatBytes(stats.memUsageBytes)} / ${formatBytes(stats.memLimitBytes)} (${stats.memPercent.toFixed(1)}%)`}
            />
            <p className="text-xs text-text-muted">Updates every 2 seconds.</p>
          </>
        )}
      </div>
    </StyledModal>
  )
}
