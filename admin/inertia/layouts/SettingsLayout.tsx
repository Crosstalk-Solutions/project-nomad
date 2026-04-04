import {
  IconArrowBigUpLines,
  IconChartBar,
  IconDashboard,
  IconFolder,
  IconGavel,
  IconHeart,
  IconMapRoute,
  IconSettings,
  IconTerminal2,
  IconWand,
  IconZoom,
} from '@tabler/icons-react'
import { usePage } from '@inertiajs/react'
import StyledSidebar from '~/components/StyledSidebar'
import { getServiceLink } from '~/lib/navigation'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import { SERVICE_NAMES } from '../../constants/service_names'
import LanguageSwitcher from '~/components/LanguageSwitcher'
import { useTranslation } from 'react-i18next'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const aiAssistantInstallStatus = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)

  const navigation = [
    ...(aiAssistantInstallStatus.isInstalled
      ? [{ name: aiAssistantName, href: '/settings/models', icon: IconWand, current: false }]
      : []),
    { name: t('settings.apps'), href: '/settings/apps', icon: IconTerminal2, current: false },
    {
      name: t('settings.benchmark'),
      href: '/settings/benchmark',
      icon: IconChartBar,
      current: false,
    },
    {
      name: t('settings.contentExplorer'),
      href: '/settings/zim/remote-explorer',
      icon: IconZoom,
      current: false,
    },
    { name: t('settings.contentManager'), href: '/settings/zim', icon: IconFolder, current: false },
    { name: t('settings.mapsManager'), href: '/settings/maps', icon: IconMapRoute, current: false },
    {
      name: t('settings.serviceLogs'),
      href: getServiceLink('9999'),
      icon: IconDashboard,
      current: false,
      target: '_blank',
    },
    {
      name: t('settings.checkUpdates'),
      href: '/settings/update',
      icon: IconArrowBigUpLines,
      current: false,
    },
    { name: t('settings.system'), href: '/settings/system', icon: IconSettings, current: false },
    { name: t('settings.support'), href: '/settings/support', icon: IconHeart, current: false },
    { name: t('settings.legal'), href: '/settings/legal', icon: IconGavel, current: false },
  ]

  return (
    <div className="min-h-screen flex flex-row bg-surface-secondary/90">
      <StyledSidebar title={t('settings.title')} items={navigation} />
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-desert-stone-light bg-desert-white">
          <LanguageSwitcher />
        </div>
        {children}
      </div>
    </div>
  )
}
