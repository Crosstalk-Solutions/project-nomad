import { Head, Link } from '@inertiajs/react'
import { IconArrowLeft } from '@tabler/icons-react'

import PersonaManager from '~/components/personas/PersonaManager'

export default function PersonasPage(props: {
  settings?: { chatPersonasEnabled?: boolean }
}) {
  const personasEnabled = props.settings?.chatPersonasEnabled ?? true

  return (
    <div className="w-full h-screen flex flex-col bg-surface-primary">
      <Head title="Personas" />

      <div className="px-6 py-3 border-b border-border-subtle bg-surface-secondary flex items-center h-[75px] flex-shrink-0">
        <Link href="/chat" className="flex items-center text-text-secondary hover:text-text-primary">
          <IconArrowLeft className="mr-2" size={20} />
          <span>Back to Chat</span>
        </Link>
        <h1 className="flex-1 text-center text-lg font-semibold text-text-primary">Personas</h1>
      </div>

      {!personasEnabled && (
        <div className="px-6 py-3 border-b border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">
          Chat personas are currently <strong>disabled in Settings</strong>. Edits below are saved, but the chat will not use them until you re-enable personas under <Link href="/settings/models" className="underline">Settings → AI Assistant</Link>.
        </div>
      )}

      <div className="flex-1 p-6 overflow-auto">
        <PersonaManager />
      </div>
    </div>
  )
}
