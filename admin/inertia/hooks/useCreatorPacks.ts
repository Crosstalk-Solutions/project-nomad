import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '~/lib/api'

export const CREATOR_PACKS_KEY = 'creator-packs'

/**
 * Shared, cached source of Creator Packs state for every surface (Content
 * Explorer block, settings page, settings nav gate, Easy Setup wizard step).
 *
 * `configured` reflects whether this build carries the release-injected app key.
 * When false (forks / key unset) the surfaces HIDE themselves — the catalog is
 * public so packs would otherwise list with install buttons that only 503.
 *
 * Polls while a pack download is in flight so the card status flips promptly;
 * otherwise refetches lazily.
 */
const useCreatorPacks = (enabled = true) => {
  const queryClient = useQueryClient()

  const queryData = useQuery({
    queryKey: [CREATOR_PACKS_KEY],
    queryFn: () => api.getCreatorPacks(),
    refetchInterval: (query) => {
      const anyDownloading = query.state.data?.packs?.some((p) => p.status === 'downloading')
      return anyDownloading ? 2000 : false
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    enabled,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [CREATOR_PACKS_KEY] })
  }

  return {
    ...queryData,
    configured: queryData.data?.configured ?? false,
    packs: queryData.data?.packs ?? [],
    downloads: queryData.data?.downloads ?? [],
    invalidate,
  }
}

export default useCreatorPacks
