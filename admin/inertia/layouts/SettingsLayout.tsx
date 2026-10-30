import { useI18n } from '~/context/I18nProvider'
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
import StyledSidebar from '~/components/StyledSidebar'
import { getServiceLink } from '~/lib/navigation'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import useCreatorPacks from '~/hooks/useCreatorPacks'
import { SERVICE_NAMES } from '../../constants/service_names'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const aiAssistantInstallStatus = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)
  // Only show the Creator Packs entry on builds that can actually install packs
  // (release-injected key present) — a fork built from source has no key.
  const { configured: creatorPacksConfigured } = useCreatorPacks()

  const navigation = [
    ...(aiAssistantInstallStatus.isInstalled ? [{ name: aiAssistantName, href: '/settings/models', icon: IconWand, current: false }] : []),
    { name: t('Supply Depot'), href: '/supply-depot', icon: IconBox, current: false },
    { name: t('Benchmark'), href: '/settings/benchmark', icon: IconChartBar, current: false },
    { name: t('Content Explorer'), href: '/settings/zim/remote-explorer', icon: IconZoom, current: false },
    { name: t('Content Manager'), href: '/settings/zim', icon: IconFolder, current: false },
    ...(creatorPacksConfigured ? [{ name: t('Creator Packs'), href: '/settings/creator-packs', icon: IconMovie, current: false }] : []),
    { name: t('Maps Manager'), href: '/settings/maps', icon: IconMapRoute, current: false },
    {
      name: t('Service Logs & Metrics'),
      href: getServiceLink('9999'),
      icon: IconDashboard,
      current: false,
      target: '_blank',
    },
    {
      name: t('Check for Updates'),
      href: '/settings/update',
      icon: IconArrowBigUpLines,
      current: false,
    },
    { name: t('System'), href: '/settings/system', icon: IconSettings, current: false },
    { name: t('Advanced'), href: '/settings/advanced', icon: IconAdjustments, current: false },
    { name: t('API Reference'), href: '/reference', icon: IconCode, current: false },
    { name: t('Support the Project'), href: '/settings/support', icon: IconHeart, current: false },
    { name: t('Legal Notices'), href: '/settings/legal', icon: IconGavel, current: false },
  ]

  return (
    <div className="min-h-screen flex flex-row bg-surface-secondary/90">
      <StyledSidebar title={t("Settings")} items={navigation} />
      {children}
    </div>
  )
}
