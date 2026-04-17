import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '~/lib/api'

const useEmbedJobs = (props: { enabled?: boolean } = {}) => {
  const queryClient = useQueryClient()
  const prevCountRef = useRef<number>(0)

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

  // When jobs drain to zero, refresh stored files so they appear without reopening the modal
  useEffect(() => {
    const currentCount = queryData.data?.length ?? 0
    if (prevCountRef.current > 0 && currentCount === 0) {
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
    }
    prevCountRef.current = currentCount
  }, [queryData.data, queryClient])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
  }

  return { ...queryData, invalidate }
}

export default useEmbedJobs
