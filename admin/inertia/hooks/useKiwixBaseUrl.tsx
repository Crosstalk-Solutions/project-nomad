import { useQuery } from '@tanstack/react-query'
import { ServiceSlim } from '../../types/services'
import api from '~/lib/api'
import { getServiceLink } from '~/lib/navigation'
import { SERVICE_NAMES } from '../../constants/service_names'

/**
 * Base URL of the installed Kiwix reader as this browser should open it, honouring
 * a custom "Open" URL the same way the dashboard does. Null when Kiwix is not
 * installed, so callers can fall back to plain-text citations.
 */
const useKiwixBaseUrl = (): string | null => {
  const { data } = useQuery<ServiceSlim[] | undefined>({
    queryKey: ['installed-services'],
    queryFn: () => api.getSystemServices(),
  })
  const kiwix = data?.find((s) => s.service_name === SERVICE_NAMES.KIWIX && s.installed)
  if (!kiwix || !(kiwix.ui_location || kiwix.custom_url)) return null
  return getServiceLink(kiwix.ui_location || '', kiwix.custom_url)
}

export default useKiwixBaseUrl
