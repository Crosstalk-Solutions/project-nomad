import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import StyledSidebar from '~/components/StyledSidebar'
import api from '~/lib/api'
import { useTranslation } from 'react-i18next'

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery<Array<{ title: string; slug: string }>>({
    queryKey: ['docs'],
    queryFn: () => api.listDocs(),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })

  const items = useMemo(() => {
    if (isLoading || !data) return []

    return data.map((doc) => ({
      name: doc.title,
      href: `/docs/${doc.slug}`,
      current: false,
    }))
  }, [data, isLoading])

  return (
    <div className="min-h-screen flex flex-row bg-desert-white">
      <StyledSidebar title={t('common.documentation')} items={items} />
      {children}
    </div>
  )
}
