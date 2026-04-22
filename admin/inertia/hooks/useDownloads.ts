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
      // Idle poll is kept tight so newly-dispatched jobs surface quickly — small ZIM
      // updates can complete in ~2s, so a 30s idle interval almost always missed them.
      return data && data.length > 0 ? 2000 : 3000
    },
    enabled: props.enabled ?? true,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKey })
  }

  return { ...queryData, invalidate }
}

export default useDownloads
