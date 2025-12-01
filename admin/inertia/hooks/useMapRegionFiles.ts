import { useQuery } from '@tanstack/react-query'
import { FileEntry } from '../../types/files'
import api from '~/lib/api'

const useMapRegionFiles = () => {
  return useQuery<FileEntry[]>({
    queryKey: ['map-region-files'],
    queryFn: () => api.listMapRegionFiles(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export default useMapRegionFiles
