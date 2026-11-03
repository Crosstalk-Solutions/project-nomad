import {
  IconBolt,
  IconBox,
  IconHelp,
  IconMapRoute,
  IconPill,
  IconSettings,
  IconWifiOff,
} from '@tabler/icons-react'
import { Head, Link, router, usePage } from '@inertiajs/react'
import AppLayout from '~/layouts/AppLayout'
import { getServiceLink } from '~/lib/navigation'
import { ServiceSlim } from '../../types/services'
import DynamicIcon, { DynamicIconName } from '~/components/DynamicIcon'
import { useUpdateAvailable } from '~/hooks/useUpdateAvailable'
import { useSystemSetting } from '~/hooks/useSystemSetting'
import {
  useBenchmarkRerunBanner,
  BENCHMARK_RERUN_BANNER_QUERY_KEY,
} from '~/hooks/useBenchmarkRerunBanner'
import { useQueryClient } from '@tanstack/react-query'
import api from '~/lib/api'
import Alert from '~/components/Alert'
import WhatsNewBanner from '~/components/WhatsNewBanner'
import { SERVICE_NAMES } from '../../constants/service_names'
import { useTranslation } from 'react-i18next'

interface DashboardItem {
  label: string
  to: string
  target: string
  description: string
  icon: React.ReactNode
  installed: boolean
  displayOrder: number
  poweredBy: string | null
}

export default function Home(props: {
  system: {
    services: ServiceSlim[]
  }
  // Server-computed: true when the offline FDA drug dataset is installed or
  // installing (curated Medicine tier). Gates the two medical-reference tiles
  // below so they only appear once the data exists.
  drugReferenceInstalled: boolean
}) {
  const { t } = useTranslation('home')
  const items: DashboardItem[] = []
  const updateInfo = useUpdateAvailable()
  const rerunBanner = useBenchmarkRerunBanner()
  const queryClient = useQueryClient()
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props

  const handleDismissRerunBanner = async () => {
    await api.updateSetting('benchmark.rerunBannerDismissed', true)
    queryClient.invalidateQueries({ queryKey: BENCHMARK_RERUN_BANNER_QUERY_KEY })
  }

  // Check if user has visited Easy Setup
  const { data: easySetupVisited } = useSystemSetting({
    key: 'ui.hasVisitedEasySetup',
  })
  const shouldHighlightEasySetup = easySetupVisited?.value
    ? String(easySetupVisited.value) !== 'true'
    : false

  // Add installed services (non-dependency services only)
  props.system.services
    .filter((service) => service.installed && (service.ui_location || service.custom_url))
    .forEach((service) => {
      items.push({
        // Inject custom AI Assistant name if this is the chat service
        label:
          service.service_name === SERVICE_NAMES.OLLAMA && aiAssistantName
            ? aiAssistantName
            : service.friendly_name || service.service_name,
        to:
          service.ui_location || service.custom_url
            ? getServiceLink(service.ui_location || '', service.custom_url)
            : '#',
        target: '_blank',
        description:
          service.description ||
          t('service_access_fallback', {
            name: service.friendly_name || service.service_name,
          }),
        icon: service.icon ? (
          <DynamicIcon icon={service.icon as DynamicIconName} className="!size-12" />
        ) : (
          <IconWifiOff size={48} />
        ),
        installed: service.installed,
        displayOrder: service.display_order ?? 100,
        poweredBy: service.powered_by ?? null,
      })
    })

  // Add Maps as a Core Capability (display_order: 4)
  items.push({
    label: t('system_items.maps.label'),
    to: '/maps',
    target: '',
    description: t('system_items.maps.description'),
    icon: <IconMapRoute size={48} />,
    installed: true,
    displayOrder: 4,
    poweredBy: null,
  })

  // Add the offline medical-reference tiles only once the FDA drug dataset is
  // installed (or installing) via the curated Medicine tier. Both tiles read the
  // same drug_labels table, so they gate together off one server-computed flag.
  if (props.drugReferenceInstalled) {
    items.push({
      label: t('system_items.drug_reference.label'),
      to: '/drug-reference',
      target: '',
      description: t('system_items.drug_reference.description'),
      icon: <IconPill size={48} />,
      installed: true,
      displayOrder: 5,
      poweredBy: null,
    })
  }

  // Add system items
  items.push(
    {
      label: t('system_items.easy_setup.label'),
      to: '/easy-setup',
      target: '',
      description: t('system_items.easy_setup.description'),
      icon: <IconBolt size={48} />,
      installed: true,
      displayOrder: 50,
      poweredBy: null,
    },
    {
      label: t('system_items.supply_depot.label'),
      to: '/supply-depot',
      target: '',
      description: t('system_items.supply_depot.description'),
      icon: <IconBox size={48} />,
      installed: true,
      displayOrder: 51,
      poweredBy: null,
    },
    {
      label: t('system_items.docs.label'),
      to: '/docs/home',
      target: '',
      description: t('system_items.docs.description'),
      icon: <IconHelp size={48} />,
      installed: true,
      displayOrder: 52,
      poweredBy: null,
    },
    {
      label: t('system_items.settings.label'),
      to: '/settings/system',
      target: '',
      description: t('system_items.settings.description'),
      icon: <IconSettings size={48} />,
      installed: true,
      displayOrder: 53,
      poweredBy: null,
    }
  )

  // Sort all items by display order
  items.sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <AppLayout>
      <Head title={t('title')} />
      {updateInfo?.updateAvailable && (
        <div className="flex justify-center items-center p-4 w-full">
          <Alert
            title={t('alerts.update_available.title')}
            type="info-inverted"
            variant="solid"
            className="w-full"
            buttonProps={{
              variant: 'primary',
              children: t('alerts.update_available.button'),
              icon: 'IconSettings',
              onClick: () => router.visit('/settings/update'),
            }}
          />
        </div>
      )}
      <WhatsNewBanner />
      {rerunBanner?.show && (
        <div className="flex justify-center items-center px-4 pt-4 w-full">
          <Alert
            title={t('alerts.benchmark_rescore.title')}
            message={t('alerts.benchmark_rescore.message')}
            type="info-inverted"
            variant="solid"
            className="w-full"
            dismissible
            onDismiss={handleDismissRerunBanner}
            buttonProps={{
              variant: 'primary',
              children: t('alerts.benchmark_rescore.button'),
              icon: 'IconRefresh',
              onClick: () => router.visit('/settings/benchmark'),
            }}
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {items.map((item) => {
          const isEasySetup = item.to === '/easy-setup'
          const shouldHighlight = isEasySetup && shouldHighlightEasySetup

          const tileContent = (
            <div className="relative rounded border-desert-green border-2 bg-desert-green hover:bg-transparent hover:text-text-primary text-white transition-colors shadow-sm h-48 flex flex-col items-center justify-center cursor-pointer text-center px-4">
              {shouldHighlight && (
                <span className="absolute top-2 right-2 flex items-center justify-center">
                  <span
                    className="animate-ping absolute inline-flex w-16 h-6 rounded-full bg-desert-orange-light opacity-75"
                    style={{ animationDuration: '1.5s' }}
                  ></span>
                  <span className="relative inline-flex items-center rounded-full px-2.5 py-1 bg-desert-orange-light text-xs font-semibold text-white shadow-sm">
                    {t('badges.start_here')}
                  </span>
                </span>
              )}
              <div className="flex items-center justify-center mb-2">{item.icon}</div>
              <h3 className="font-bold text-2xl">{item.label}</h3>
              {item.poweredBy && (
                <p className="text-sm opacity-80">{t('powered_by', { name: item.poweredBy })}</p>
              )}
              <p className="xl:text-lg mt-2">{item.description}</p>
            </div>
          )

          return item.target === '_blank' ? (
            <a key={item.label} href={item.to} target="_blank" rel="noopener noreferrer">
              {tileContent}
            </a>
          ) : (
            <Link key={item.label} href={item.to}>
              {tileContent}
            </Link>
          )
        })}
      </div>
    </AppLayout>
  )
}
