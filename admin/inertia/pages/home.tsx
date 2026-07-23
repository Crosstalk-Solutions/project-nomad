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

// Maps is a Core Capability (display_order: 4)
const MAPS_ITEM = {
  label: 'Maps',
  to: '/maps',
  target: '',
  description: 'View offline maps',
  icon: <IconMapRoute size={48} />,
  installed: true,
  displayOrder: 4,
  poweredBy: null,
}

// Drug Reference + "When to use what" — offline medical reference tiles.
// icon and displayOrder here are a reasonable default; both are open for the
// maintainer to re-pick to fit the dashboard's ordering conventions.
const DRUG_REFERENCE_ITEM = {
  label: 'Drug Reference',
  to: '/drug-reference',
  target: '',
  description: 'Offline FDA drug labels — search by drug name, or by situation (burn, fever, diarrhea)',
  icon: <IconPill size={48} />,
  installed: true,
  displayOrder: 5,
  poweredBy: null,
}

// System items shown after all apps
const SYSTEM_ITEMS = [
  {
    label: 'Easy Setup',
    to: '/easy-setup',
    target: '',
    description:
      'Not sure where to start? Use the setup wizard to quickly configure your NOMAD!',
    icon: <IconBolt size={48} />,
    installed: true,
    displayOrder: 50,
    poweredBy: null,
  },
  {
    label: 'Supply Depot',
    to: '/supply-depot',
    target: '',
    description: 'Browse and install curated apps, or add your own Docker container',
    icon: <IconBox size={48} />,
    installed: true,
    displayOrder: 51,
    poweredBy: null,
  },
  {
    label: 'Docs',
    to: '/docs/home',
    target: '',
    description: 'Read Project NOMAD manuals and guides',
    icon: <IconHelp size={48} />,
    installed: true,
    displayOrder: 52,
    poweredBy: null,
  },
  {
    label: 'Settings',
    to: '/settings/system',
    target: '',
    description: 'Configure your NOMAD settings',
    icon: <IconSettings size={48} />,
    installed: true,
    displayOrder: 53,
    poweredBy: null,
  },
]

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
  const items: DashboardItem[] = []
  const updateInfo = useUpdateAvailable();
  const rerunBanner = useBenchmarkRerunBanner()
  const queryClient = useQueryClient()
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props

  const handleDismissRerunBanner = async () => {
    await api.updateSetting('benchmark.rerunBannerDismissed', true)
    queryClient.invalidateQueries({ queryKey: BENCHMARK_RERUN_BANNER_QUERY_KEY })
  }

  // Check if user has visited Easy Setup
  const { data: easySetupVisited } = useSystemSetting({
    key: 'ui.hasVisitedEasySetup'
  })
  const shouldHighlightEasySetup = easySetupVisited?.value ? String(easySetupVisited.value) !== 'true' : false

  // Add installed services (non-dependency services only)
  props.system.services
    .filter((service) => service.installed && (service.ui_location || service.custom_url))
    .forEach((service) => {
      items.push({
        // Inject custom AI Assistant name if this is the chat service
        label: service.service_name === SERVICE_NAMES.OLLAMA && aiAssistantName ? aiAssistantName : (service.friendly_name || service.service_name),
        to:
          service.ui_location || service.custom_url
            ? getServiceLink(service.ui_location || '', service.custom_url)
            : '#',
        target: '_blank',
        description:
          service.description ||
          `Access the ${service.friendly_name || service.service_name} application`,
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

  // Add Maps as a Core Capability
  items.push(MAPS_ITEM)

  // Add the offline medical-reference tiles only once the FDA drug dataset is
  // installed (or installing) via the curated Medicine tier. Both tiles read the
  // same drug_labels table, so they gate together off one server-computed flag.
  if (props.drugReferenceInstalled) {
    items.push(DRUG_REFERENCE_ITEM)
  }

  // Add system items
  items.push(...SYSTEM_ITEMS)

  // Sort all items by display order
  items.sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <AppLayout>
      <Head title="Command Center" />
      {
        updateInfo?.updateAvailable && (
          <div className='flex justify-center items-center p-4 w-full'>
            <Alert
              title="An update is available for Project NOMAD!"
              type="info-inverted"
              variant="solid"
              className="w-full"
              buttonProps={{
                variant: 'primary',
                children: 'Go to Settings',
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
              title="Your benchmark can be re-scored with Score v2"
              message="We've upgraded the benchmark scoring system. Re-run your benchmark to get an updated Score v2 result on the community leaderboard."
              type="info-inverted"
              variant="solid"
              className="w-full"
              dismissible
              onDismiss={handleDismissRerunBanner}
              buttonProps={{
                variant: 'primary',
                children: 'Re-run benchmark',
                icon: 'IconRefresh',
                onClick: () => router.visit('/settings/benchmark'),
              }}
            />
          </div>
        )
      }
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {items.map((item) => {
          const isEasySetup = item.label === 'Easy Setup'
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
                    Start here!
                  </span>
                </span>
              )}
              <div className="flex items-center justify-center mb-2">{item.icon}</div>
              <h3 className="font-bold text-2xl">{item.label}</h3>
              {item.poweredBy && <p className="text-sm opacity-80">Powered by {item.poweredBy}</p>}
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
