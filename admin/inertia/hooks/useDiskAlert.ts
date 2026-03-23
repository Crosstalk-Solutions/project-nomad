import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import api from '~/lib/api'

type DiskAlertLevel = 'none' | 'warning' | 'critical'

interface DiskStatusResponse {
  level: DiskAlertLevel
  threshold: number
  highestUsage: number
  diskName: string
}

const DISMISSED_KEY = 'nomad:disk-alert-dismissed-level'

export function useDiskAlert() {
  const [dismissedLevel, setDismissedLevel] = useState<DiskAlertLevel | null>(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) as DiskAlertLevel | null
    } catch {
      return null
    }
  })

  const { data: diskStatus } = useQuery<DiskStatusResponse | undefined>({
    queryKey: ['disk-status'],
    queryFn: async () => await api.getDiskStatus(),
    refetchInterval: 45000,
  })

  const shouldShow = useMemo(() => {
    if (!diskStatus || diskStatus.level === 'none') return false
    if (!dismissedLevel) return true
    // Exibe novamente se o nível piorou
    if (dismissedLevel === 'warning' && diskStatus.level === 'critical') return true
    return false
  }, [diskStatus, dismissedLevel])

  const dismiss = () => {
    if (diskStatus) {
      setDismissedLevel(diskStatus.level)
      try {
        localStorage.setItem(DISMISSED_KEY, diskStatus.level)
      } catch {}
    }
  }

  return {
    diskStatus,
    shouldShow,
    dismiss,
  }
}
