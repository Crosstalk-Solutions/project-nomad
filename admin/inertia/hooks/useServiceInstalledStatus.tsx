import { useQuery } from '@tanstack/react-query'
import { ServiceSlim } from '../../types/services'
import api from '~/lib/api'

const useServiceInstalledStatus = (serviceName: string) => {
  const { data, isFetching } = useQuery<ServiceSlim[] | undefined>({
    queryKey: ['installed-services'],
    queryFn: () => api.listServices(),
  })

  const isInstalled = data?.some(
    (service) => service.service_name === serviceName && service.installed
  )

  return { isInstalled, loading: isFetching }
}

export default useServiceInstalledStatus
