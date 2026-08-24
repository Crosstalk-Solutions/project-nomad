import {
  IconAdjustments,
  IconArrowBigUpLines,
  IconBox,
  IconChartBar,
  IconCode,
  IconDashboard,
  IconFolder,
  IconGavel,
  IconHeart,
  IconMapRoute,
  IconMovie,
  IconSettings,
  IconWand,
  IconZoom
} from '@tabler/icons-react'
import { usePage } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import StyledSidebar from '~/components/StyledSidebar'
import { getServiceLink } from '~/lib/navigation'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import useCreatorPacks from '~/hooks/useCreatorPacks'
import { SERVICE_NAMES } from '../../constants/service_names'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const aiAssistantInstallStatus = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)
  const { configured: creatorPacksConfigured } = useCreatorPacks()

  const navigation = [
    ...(aiAssistantInstallStatus.isInstalled ? [{ name: aiAssistantName, href: '/settings/models', icon: IconWand, current: false }] : []),
    { name: t('settings.nav.supply_depot'), href: '/supply-depot', icon: IconBox, current: false },
    { name: t('settings.nav.benchmark'), href: '/settings/benchmark', icon: IconChartBar, current: false },
    { name: t('settings.nav.content_explorer'), href: '/settings/zim/remote-explorer', icon: IconZoom, current: false },
    { name: t('settings.nav.content_manager'), href: '/settings/zim', icon: IconFolder, current: false },
    ...(creatorPacksConfigured ? [{ name: t('settings.nav.creator_packs'), href: '/settings/creator-packs', icon: IconMovie, current: false }] : []),
    { name: t('settings.nav.maps_manager'), href: '/settings/maps', icon: IconMapRoute, current: false },
    {
      name: t('settings.nav.service_logs'),
      href: getServiceLink('9999'),
      icon: IconDashboard,
      current: false,
      target: '_blank',
    },
    {
      name: t('settings.nav.check_updates'),
      href: '/settings/update',
      icon: IconArrowBigUpLines,
      current: false,
    },
    { name: t('settings.nav.system'), href: '/settings/system', icon: IconSettings, current: false },
    { name: t('settings.nav.advanced'), href: '/settings/advanced', icon: IconAdjustments, current: false },
    { name: t('settings.nav.api_reference'), href: '/reference', icon: IconCode, current: false },
    { name: t('settings.nav.support'), href: '/settings/support', icon: IconHeart, current: false },
    { name: t('settings.nav.legal'), href: '/settings/legal', icon: IconGavel, current: false },
  ]

  return (
    <div className="min-h-screen flex flex-row bg-surface-secondary/90">
      <StyledSidebar title={t('settings.title')} items={navigation} />
      {children}
    </div>
  )
}
