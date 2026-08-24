import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Footer from '~/components/Footer'
import ChatButton from '~/components/chat/ChatButton'
import ChatModal from '~/components/chat/ChatModal'
import LanguageSwitcher from '~/components/LanguageSwitcher'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import { SERVICE_NAMES } from '../../constants/service_names'
import { Link, router } from '@inertiajs/react'
import { IconArrowLeft } from '@tabler/icons-react'
import classNames from 'classnames'

export default function AppLayout({
  children,
  compact = false,
}: {
  children: React.ReactNode
  compact?: boolean
}) {
  const { t } = useTranslation()
  const [isChatOpen, setIsChatOpen] = useState(false)
  const aiAssistantInstalled = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)

  return (
    <div className="min-h-screen flex flex-col">
      {
        window.location.pathname !== '/home' && (
          <Link
            href="/home"
            className={classNames(
              'absolute left-4 flex items-center',
              compact ? 'top-4' : 'top-60 md:top-48'
            )}
          >
            <IconArrowLeft className="mr-2" size={24} />
            <p className="text-lg text-text-secondary">{t('layout.back_to_home')}</p>
          </Link>
        )}
      <div className="absolute top-3 right-4">
        <LanguageSwitcher />
      </div>
      <div
        className={classNames(
          'flex cursor-pointer items-center justify-center',
          compact ? 'gap-3 p-3 flex-row' : 'gap-2 p-2 flex-col'
        )}
        onClick={() => router.visit('/home')}
      >
        <img
          src="/project_nomad_logo.webp"
          alt="Project NOMAD Logo"
          className={compact ? 'h-12 w-12' : 'h-40 w-40'}
        />
        <h1
          className={classNames(
            'font-bold text-desert-green',
            compact ? 'text-2xl' : 'text-5xl'
          )}
        >
          {t('layout.command_center')}
        </h1>
      </div>
      <hr className={
        classNames(
          "text-desert-green font-semibold h-[1.5px] bg-desert-green border-none",
          !compact && window.location.pathname !== '/home' ? "mt-12 md:mt-0" : "mt-0"
        )} />
      <div className="flex-1 w-full bg-desert">{children}</div>
      <Footer />

      {aiAssistantInstalled && (
        <>
          <ChatButton onClick={() => setIsChatOpen(true)} />
          <ChatModal open={isChatOpen} onClose={() => setIsChatOpen(false)} />
        </>
      )}
    </div>
  )
}
