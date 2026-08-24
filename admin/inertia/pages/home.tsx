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
import { useTranslation } from 'react-i18next'
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
  drugReferenceInstalled: boolean
}) {
  const { t } = useTranslation()
  const items: DashboardItem[] = []
  const updateInfo = useUpdateAvailable()
  const rerunBanner = useBenchmarkRerunBanner()
  const queryClient = useQueryClient()
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props

  const MAPS_ITEM: DashboardItem = {
    label: t('home.tiles.maps'),
    to: '/maps',
    target: '',
    description: t('home.tiles.maps_desc'),
    icon: <IconMapRoute size={48} />,
    installed: true,
    displayOrder: 4,
    poweredBy: null,
  }

  const DRUG_REFERENCE_ITEM: DashboardItem = {
    label: t('home.tiles.drug_reference'),
    to: '/drug-reference',
    target: '',
    description: t('home.tiles.drug_reference_desc'),
    icon: <IconPill size={48} />,
    installed: true,
    displayOrder: 5,
    poweredBy: null,
  }

  const SYSTEM_ITEMS: DashboardItem[] = [
    {
      label: t('home.tiles.easy_setup'),
      to: '/easy-setup',
      target: '',
      description: t('home.tiles.easy_setup_desc'),
      icon: <IconBolt size={48} />,
      installed: true,
      displayOrder: 50,
      poweredBy: null,
    },
    {
      label: t('home.tiles.supply_depot'),
      to: '/supply-depot',
      target: '',
      description: t('home.tiles.supply_depot_desc'),
      icon: <IconBox size={48} />,
      installed: true,
      displayOrder: 51,
      poweredBy: null,
    },
    {
      label: t('home.tiles.docs'),
      to: '/docs/home',
      target: '',
      description: t('home.tiles.docs_desc'),
      icon: <IconHelp size={48} />,
      installed: true,
      displayOrder: 52,
      poweredBy: null,
    },
    {
      label: t('home.tiles.settings'),
      to: '/settings/system',
      target: '',
      description: t('home.tiles.settings_desc'),
      icon: <IconSettings size={48} />,
      installed: true,
      displayOrder: 53,
      poweredBy: null,
    },
  ]

  const handleDismissRerunBanner = async () => {
    await api.updateSetting('benchmark.rerunBannerDismissed', true)
    queryClient.invalidateQueries({ queryKey: BENCHMARK_RERUN_BANNER_QUERY_KEY })
  }

  const { data: easySetupVisited } = useSystemSetting({
    key: 'ui.hasVisitedEasySetup'
  })
  const shouldHighlightEasySetup = easySetupVisited?.value ? String(easySetupVisited.value) !== 'true' : false

  props.system.services
    .filter((service) => service.installed && (service.ui_location || service.custom_url))
    .forEach((service) => {
      items.push({
        label: service.service_name === SERVICE_NAMES.OLLAMA && aiAssistantName ? aiAssistantName : (service.friendly_name || service.service_name),
        to:
          service.ui_location || service.custom_url
            ? getServiceLink(service.ui_location || '', service.custom_url)
            : '#',
        target: '_blank',
        description:
          service.description ||
          `${t('common.open')} ${service.friendly_name || service.service_name}`,
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

  items.push(MAPS_ITEM)

  if (props.drugReferenceInstalled) {
    items.push(DRUG_REFERENCE_ITEM)
  }

  items.push(...SYSTEM_ITEMS)
  items.sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <AppLayout>
      <Head title={t('home.title')} />
      {
        updateInfo?.updateAvailable && (
          <div className='flex justify-center items-center p-4 w-full'>
            <Alert
              title={t('home.update_available')}
              type="info-inverted"
              variant="solid"
              className="w-full"
              buttonProps={{
                variant: 'primary',
                children: t('home.go_to_settings'),
                icon: 'IconSettings',
                onClick: () => router.visit('/settings/update'),
              }}
            />
          </div>
        )
      }
      <WhatsNewBanner />
      {
        rerunBanner?.show && (
          <div className='flex justify-center items-center px-4 pt-4 w-full'>
            <Alert
              title={t('home.benchmark_rescore')}
              message={t('home.benchmark_rescore_desc')}
              type="info-inverted"
              variant="solid"
              className="w-full"
              dismissible
              onDismiss={handleDismissRerunBanner}
              buttonProps={{
                variant: 'primary',
                children: t('home.rerun_benchmark'),
                icon: 'IconRefresh',
                onClick: () => router.visit('/settings/benchmark'),
              }}
            />
          </div>
        )
      }
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {items.map((item) => {
          const isEasySetup = item.label === t('home.tiles.easy_setup')
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
                    {t('home.start_here')}
                  </span>
                </span>
              )}
              <div className="flex items-center justify-center mb-2">{item.icon}</div>
              <h3 className="font-bold text-2xl">{item.label}</h3>
              {item.poweredBy && <p className="text-sm opacity-80">{t('common.powered_by', { name: item.poweredBy })}</p>}
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
