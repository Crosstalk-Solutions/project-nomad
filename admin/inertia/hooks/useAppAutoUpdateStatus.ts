import { useQuery } from '@tanstack/react-query'
import api from '~/lib/api'
import { AppAutoUpdateStatus } from '../../types/system'

export const useAppAutoUpdateStatus = () => {
  return useQuery<AppAutoUpdateStatus | undefined>({
    queryKey: ['app-auto-update-status'],
    queryFn: () => api.getAppAutoUpdateStatus(),
    refetchOnWindowFocus: false,
  })
}
