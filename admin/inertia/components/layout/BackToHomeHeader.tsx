import { Link } from '@inertiajs/react'
import { IconArrowLeft } from '@tabler/icons-react'
import classNames from '~/lib/classNames'
import { useTranslation } from 'react-i18next'

interface BackToHomeHeaderProps {
  className?: string
  children?: React.ReactNode
}

export default function BackToHomeHeader({ className, children }: BackToHomeHeaderProps) {
  const { t } = useTranslation()
  return (
    <div className={classNames('flex border-b border-border-subtle p-4', className)}>
      <div className="justify-self-start">
        <Link href="/home" className="flex items-center">
          <IconArrowLeft className="mr-2" size={24} />
          <p className="text-lg text-text-secondary">{t('common.backToHome')}</p>
        </Link>
      </div>
      <div className="flex-grow flex flex-col justify-center">{children}</div>
    </div>
  )
}
