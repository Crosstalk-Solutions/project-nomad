import { useQuery } from '@tanstack/react-query'
import api from '~/lib/api'
import { AutoUpdateStatus } from '../../types/system'

export const useAutoUpdateStatus = () => {
  return useQuery<AutoUpdateStatus | undefined>({
    queryKey: ['auto-update-status'],
    queryFn: () => api.getAutoUpdateStatus(),
    refetchOnWindowFocus: false,
  })
}
