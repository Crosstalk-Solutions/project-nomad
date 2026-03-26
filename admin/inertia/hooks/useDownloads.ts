import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import api from '~/lib/api'

export type useDownloadsProps = {
  filetype?: string
  enabled?: boolean
}

const useDownloads = (props: useDownloadsProps) => {
  const queryClient = useQueryClient()

  const queryKey = useMemo(() => {
    return props.filetype ? ['download-jobs', props.filetype] : ['download-jobs']
  }, [props.filetype])

  const queryData = useQuery({
    queryKey: queryKey,
    queryFn: () => api.listDownloadJobs(props.filetype),
    refetchInterval: (query) => {
      const data = query.state.data
      // Only poll when there are active downloads; otherwise use a slower interval
      return data && data.length > 0 ? 2000 : 30000
    },
    enabled: props.enabled ?? true,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKey })
  }

  return { ...queryData, invalidate }
}

export default useDownloads
