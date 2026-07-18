import { useQuery } from '@tanstack/react-query'
import api from '~/lib/api'
import { ContentAutoUpdateStatus } from '../../types/system'

export const useContentAutoUpdateStatus = () => {
  return useQuery<ContentAutoUpdateStatus | undefined>({
    queryKey: ['content-auto-update-status'],
    queryFn: () => api.getContentAutoUpdateStatus(),
    refetchOnWindowFocus: false,
  })
}
