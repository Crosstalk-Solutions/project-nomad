import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { SystemInformationResponse } from '../../types/system'
import api from '~/lib/api'

export type UseSystemInfoProps = Omit<
  UseQueryOptions<SystemInformationResponse | undefined>,
  'queryKey' | 'queryFn'
> & {}

export const useSystemInfo = (props: UseSystemInfoProps) => {
  const queryData = useQuery<SystemInformationResponse | undefined>({
    ...props,
    queryKey: ['system-info'],
    queryFn: async () => await api.getSystemInfo(),
    refetchInterval: 45000, // Refetch every 45 seconds
  })

  return queryData
}
