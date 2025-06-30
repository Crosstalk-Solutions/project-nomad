import { useMemo, useState } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, TransitionChild } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import classNames from '~/lib/classNames'
import { IconArrowLeft } from '@tabler/icons-react'

interface StyledSidebarProps {
  title: string
  items: Array<{
    name: string
    href: string
    icon: React.ElementType
    current: boolean
  }>
}

const StyledSidebar: React.FC<StyledSidebarProps> = ({ title, items }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const currentPath = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.location.pathname
  }, [])

  const ListItem = (item: {
    name: string
    href: string
    icon: React.ElementType
    current: boolean
  }) => {
    return (
      <li key={item.name}>
        <a
          href={item.href}
          className={classNames(
            item.current
              ? 'bg-desert-green text-white'
              : 'text-black hover:bg-desert-green-light hover:text-white',
            'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold'
          )}
        >
          <item.icon aria-hidden="true" className="size-6 shrink-0" />
          {item.name}
        </a>
      </li>
    )
  }

  const Sidebar = () => {
    return (
      <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-desert-sand px-6 ring-1 ring-white/5 pt-4 shadow-md">
        <div className="flex h-16 shrink-0 items-center">
          <img src="/project_nomad_logo.png" alt="Project Nomad Logo" className="h-16 w-16" />
          <h1 className="ml-3 text-xl font-semibold text-black">{title}</h1>
        </div>
        <nav className="flex flex-1 flex-col">
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            <li>
              <ul role="list" className="-mx-2 space-y-1">
                {items.map((item) => (
                  <ListItem key={item.name} {...item} current={currentPath === item.href} />
                ))}
                <li className="ml-2 mt-4">
                  <a
                    href="/home"
                    className="flex flex-row items-center gap-x-3 text-desert-green text-sm font-semibold"
                  >
                    <IconArrowLeft aria-hidden="true" className="size-6 shrink-0" />
                    Back to Home
                  </a>
                </li>
              </ul>
            </li>
          </ul>
        </nav>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className="absolute left-4 top-4 z-50 xl:hidden"
        onClick={() => setSidebarOpen(true)}
      >
        <Bars3Icon aria-hidden="true" className="size-8" />
      </button>
      {/* Mobile sidebar */}
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 xl:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-black/10 transition-opacity duration-300 ease-linear data-[closed]:opacity-0"
        />

        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-[closed]:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute left-full top-0 flex w-16 justify-center pt-5 duration-300 ease-in-out data-[closed]:opacity-0">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="-m-2.5 p-2.5"
                >
                  <span className="sr-only">Close sidebar</span>
                  <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                </button>
              </div>
            </TransitionChild>
            <Sidebar />
          </DialogPanel>
        </div>
      </Dialog>
      {/* Desktop sidebar */}
      <div className="hidden xl:fixed xl:inset-y-0 xl:z-50 xl:flex xl:w-72 xl:flex-col">
        <Sidebar />
      </div>
    </>
  )
}

export default StyledSidebar
