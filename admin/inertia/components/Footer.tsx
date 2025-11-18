import { usePage } from '@inertiajs/react'

export default function Footer() {
  const { appVersion } = usePage().props as unknown as { appVersion: string }
  return (
    <footer className="">
      <div className="flex justify-center border-t border-gray-900/10 py-4">
        <p className="text-sm/6 text-gray-600">
          Project N.O.M.A.D. Command Center v{appVersion}
        </p>
      </div>
    </footer>
  )
}
