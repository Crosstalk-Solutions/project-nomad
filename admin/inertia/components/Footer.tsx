import { usePage } from '@inertiajs/react'
import { UsePageProps } from '../../types/system'
import ThemeToggle from '~/components/ThemeToggle'

export default function Footer() {
  const { appVersion } = usePage().props as unknown as UsePageProps
  return (
    <footer>
      <div className="flex items-center justify-center gap-3 border-t border-border-subtle py-4">
        <p className="text-sm/6 text-text-secondary">
          Project N.O.M.A.D. Command Center v{appVersion}
        </p>
        <ThemeToggle />
      </div>
    </footer>
  )
}
