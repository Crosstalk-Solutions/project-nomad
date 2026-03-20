import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '~/lib/api'

const useEmbedJobs = (props: { enabled?: boolean } = {}) => {
  const queryClient = useQueryClient()

  const queryData = useQuery({
    queryKey: ['embed-jobs'],
    queryFn: () => api.getActiveEmbedJobs().then((data) => data ?? []),
    refetchInterval: (query) => {
      const data = query.state.data
      // Only poll when there are active jobs; otherwise use a slower interval
      return data && data.length > 0 ? 2000 : 30000
    },
    enabled: props.enabled ?? true,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
  }

  return { ...queryData, invalidate }
}

export default useEmbedJobs
