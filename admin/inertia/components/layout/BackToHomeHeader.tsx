import { Link } from '@inertiajs/react'
import { IconArrowLeft } from '@tabler/icons-react'
import classNames from '~/lib/classNames'

interface BackToHomeHeaderProps {
  className?: string
  children?: React.ReactNode
}

export default function BackToHomeHeader({ className, children }: BackToHomeHeaderProps) {
  return (
    <div className={classNames('flex border-b border-gray-900/10 p-4', className)}>
      <div className="justify-self-start">
        <Link href="/home" className="flex items-center">
          <IconArrowLeft className="mr-2" size={24} />
          <p className="text-lg text-gray-600">Back to Home</p>
        </Link>
      </div>
      <div className="flex-grow flex flex-col justify-center">{children}</div>
    </div>
  )
}
