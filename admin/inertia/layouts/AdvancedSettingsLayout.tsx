import { IconTerminal2 } from '@tabler/icons-react'
import StyledSidebar from '~/components/StyledSidebar'

export default function AdvancedSettingsLayout({ children }: { children: React.ReactNode }) {
  const navigation = [
    { name: 'Apps', href: '/settings/advanced/apps', icon: IconTerminal2, current: false },
  ]

  return (
    <div className="min-h-screen flex flex-row bg-surface-secondary/90">
      <StyledSidebar
        title="Advanced Settings"
        items={navigation}
        backHref="/settings/apps"
        backLabel="Back to Settings"
      />
      {children}
    </div>
  )
}
