import {
  IconBolt,
  IconHelp,
  IconMapRoute,
  IconPlus,
  IconSettings,
  IconWifiOff,
} from '@tabler/icons-react'
import { Head } from '@inertiajs/react'
import BouncingLogo from '~/components/BouncingLogo'
import AppLayout from '~/layouts/AppLayout'
import { getServiceLink } from '~/lib/navigation'
import { ServiceSlim } from '../../types/services'
import DynamicIcon, { DynamicIconName } from '~/components/DynamicIcon'

const STATIC_ITEMS = [
  {
    label: 'Easy Setup',
    to: '/easy-setup',
    target: '',
    description:
      'Not sure where to start? Use the setup wizard to quickly configure your N.O.M.A.D.!',
    icon: <IconBolt size={48} />,
    installed: true,
  },
  {
    label: 'Install Apps',
    to: '/settings/apps',
    target: '',
    description: 'Not seeing your favorite app? Install it here!',
    icon: <IconPlus size={48} />,
    installed: true,
  },
  {
    label: 'Docs',
    to: '/docs/home',
    target: '',
    description: 'Read Project N.O.M.A.D. manuals and guides',
    icon: <IconHelp size={48} />,
    installed: true,
  },
  {
    label: 'Maps',
    to: '/maps',
    target: '',
    description: 'View offline maps',
    icon: <IconMapRoute size={48} />,
    installed: true,
  },
  {
    label: 'Settings',
    to: '/settings/system',
    target: '',
    description: 'Configure your N.O.M.A.D. settings',
    icon: <IconSettings size={48} />,
    installed: true,
  },
]

export default function Home(props: {
  system: {
    services: ServiceSlim[]
  }
}) {
  const items = []
  props.system.services.map((service) => {
    items.push({
      label: service.friendly_name || service.service_name,
      to: service.ui_location ? getServiceLink(service.ui_location) : '#',
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
    })
  })

  items.push(...STATIC_ITEMS)

  return (
    <AppLayout>
      <Head title="Command Center" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {items.map((item) => (
          <a key={item.label} href={item.to} target={item.target}>
            <div
              key={item.label}
              className="rounded border-desert-green border-2 bg-desert-green hover:bg-transparent hover:text-black text-white transition-colors shadow-sm h-48 flex flex-col items-center justify-center cursor-pointer text-center px-4"
            >
              <div className="flex items-center justify-center mb-2">{item.icon}</div>
              <h3 className="font-bold text-2xl">{item.label}</h3>
              <p className="xl:text-lg mt-2">{item.description}</p>
            </div>
          </a>
        ))}
        <BouncingLogo />
      </div>
    </AppLayout>
  )
}
