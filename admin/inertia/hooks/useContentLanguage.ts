import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '~/lib/api'

const CONTENT_LANGUAGE_KEY = ['system-setting', 'content.language']

export function useContentLanguage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: CONTENT_LANGUAGE_KEY,
    queryFn: async () => {
      const result = await api.getSetting('content.language')
      return result?.value as string | null
    },
    refetchOnWindowFocus: false,
  })

  const mutation = useMutation({
    mutationFn: async (lang: string) => {
      await api.updateSetting('content.language', lang)
    },
    onSuccess: (_data, lang) => {
      queryClient.setQueryData(CONTENT_LANGUAGE_KEY, lang)
    },
  })

  return {
    language: data || 'en',
    setLanguage: mutation.mutateAsync,
    isLoading,
  }
}
