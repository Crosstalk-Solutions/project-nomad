import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '~/lib/api'

const useEmbedJobs = (props: { enabled?: boolean } = {}) => {
  const queryClient = useQueryClient()

  const queryData = useQuery({
    queryKey: ['embed-jobs'],
    queryFn: () => api.getActiveEmbedJobs().then((data) => data ?? []),
    refetchInterval: 2000,
    enabled: props.enabled ?? true,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
  }

  return { ...queryData, invalidate }
}

export default useEmbedJobs
