import { Cog6ToothIcon, CommandLineIcon, FolderIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import StyledSidebar from '~/components/StyledSidebar'
import api from '~/lib/api'

const navigation = [
  { name: 'Apps', href: '/settings/apps', icon: CommandLineIcon, current: false },
  { name: 'ZIM Explorer', href: '/settings/zim', icon: FolderIcon, current: false },
  { name: 'System', href: '/settings/system', icon: Cog6ToothIcon, current: true },
]

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const [docs, setDocs] = useState<Array<{ title: string; slug: string }>>([])

  // Fetch docs when the component mounts
  useEffect(() => {
    fetchDocs()
  }, [])

  async function fetchDocs() {
    try {
      const data = await api.listDocs()
      console.log('Fetched docs:', data)
      setDocs(data)
    } catch (error) {
      console.error('Error fetching docs:', error)
    }
  }

  return (
    <div className="min-h-screen flex flex-row bg-stone-50/90">
      <StyledSidebar title="Documentation" items={navigation} />
      {children}
    </div>
  )
}
