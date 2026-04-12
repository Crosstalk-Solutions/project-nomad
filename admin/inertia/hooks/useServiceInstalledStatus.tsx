import { useQuery } from '@tanstack/react-query'
import { ServiceSlim } from '../../types/services'
import api from '~/lib/api'

const useServiceInstalledStatus = (serviceName: string) => {
  const { data, isFetching } = useQuery<ServiceSlim[] | undefined>({
    queryKey: ['installed-services'],
    queryFn: () => api.getSystemServices(),
  })

  const isInstalled = data?.some(
    (service) => service.service_name === serviceName && service.installed
  )
  const serviceLocation = data?.find(
    (service) => service.service_name === serviceName && service.installed
  )?.ui_location

  return { isInstalled, serviceLocation, loading: isFetching }
}

export default useServiceInstalledStatus
