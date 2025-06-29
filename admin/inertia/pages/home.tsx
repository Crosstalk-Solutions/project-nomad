import {
  IconBook,
  IconBrandWikipedia,
  IconCalculator,
  IconHelp,
  IconMapRoute,
  IconMessageCircleSearch,
  IconSettings,
  IconWifiOff,
} from '@tabler/icons-react'
import { Head, Link } from '@inertiajs/react'
import BouncingLogo from '~/components/BouncingLogo'
import AppLayout from '~/layouts/AppLayout'
import { getServiceLink } from '~/lib/navigation'

const NAV_ITEMS = [
  {
    label: 'AI Chat',
    to: '/ai-chat',
    description: 'Chat with local AI models',
    icon: <IconMessageCircleSearch size={48} />,
  },
  {
    label: 'Calculators',
    to: '/calculators',
    description: 'Perform various calculations',
    icon: <IconCalculator size={48} />,
  },
  {
    label: 'Ebooks',
    to: '/ebooks',
    description: 'Explore our collection of eBooks',
    icon: <IconBook size={48} />,
  },
  {
    label: 'Kiwix (Offline Browser)',
    to: '/kiwix',
    description: 'Access offline content with Kiwix',
    icon: <IconWifiOff size={48} />,
  },
  {
    label: 'OpenStreetMap',
    to: '/openstreetmap',
    description: 'View maps and geospatial data',
    icon: <IconMapRoute size={48} />,
  },

  {
    label: 'Wikipedia',
    to: '/wikipedia',
    description: 'Browse an offline Wikipedia snapshot',
    icon: <IconBrandWikipedia size={48} />,
  },
]

const STATIC_ITEMS = [
  {
    label: 'Help',
    to: '/help',
    description: 'Read Project N.O.M.A.D. manuals and guides',
    icon: <IconHelp size={48} />,
    installed: true,
  },
  {
    label: 'Settings',
    to: '/settings',
    description: 'Configure your N.O.M.A.D. settings',
    icon: <IconSettings size={48} />,
    installed: true,
  },
]

export default function Home(props: {
  system: {
    services: { id: number; service_name: string; installed: boolean; ui_location: string }[]
  }
}) {
  const items = []
  props.system.services.map((service) => {
    items.push({
      label: service.service_name,
      to: getServiceLink(service.ui_location),
      description: `Access ${service.service_name} content`,
      icon: <IconWifiOff size={48} />,
      installed: service.installed,
    })
  })

  items.push(...STATIC_ITEMS)

  return (
    <AppLayout>
      <Head title="Project N.O.M.A.D Command Center" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {items.map((item) => (
          <a key={item.label} href={item.to} target="_blank">
            <div
              key={item.label}
              className="rounded border-desert-green border-2 bg-desert-green hover:bg-transparent hover:text-black text-white transition-colors shadow-sm h-48 flex flex-col items-center justify-center cursor-pointer"
            >
              <div className="flex items-center justify-center mb-2">{item.icon}</div>
              <h3 className="font-bold text-2xl">{item.label}</h3>
              <p className="text-lg mt-2">{item.description}</p>
            </div>
          </a>
        ))}
        <BouncingLogo />
      </div>
    </AppLayout>
  )
}
