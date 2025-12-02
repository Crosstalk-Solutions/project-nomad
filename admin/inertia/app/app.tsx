/// <reference path="../../adonisrc.ts" />
/// <reference path="../../config/inertia.ts" />

import '../css/app.css'
import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import ModalsProvider from '~/providers/ModalProvider'
import { TransmitProvider } from 'react-adonis-transmit'
import { generateUUID } from '~/lib/util'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import NotificationsProvider from '~/providers/NotificationProvider'
import { UsePageProps } from '../../types/system'

const appName = import.meta.env.VITE_APP_NAME || 'Project N.O.M.A.D.'
const queryClient = new QueryClient()

// Patch the global crypto object for non-HTTPS/localhost contexts
if (!window.crypto?.randomUUID) {
  // @ts-ignore
  if (!window.crypto) window.crypto = {}
  // @ts-ignore
  window.crypto.randomUUID = generateUUID
}

createInertiaApp({
  progress: { color: '#424420' },

  title: (title) => `${title} - ${appName}`,

  resolve: (name) => {
    return resolvePageComponent(`../pages/${name}.tsx`, import.meta.glob('../pages/**/*.tsx'))
  },

  setup({ el, App, props }) {
    const environment = (props.initialPage.props as unknown as UsePageProps).environment
    const showDevtools = ['development', 'staging'].includes(environment)
    createRoot(el).render(
      <QueryClientProvider client={queryClient}>
        <TransmitProvider baseUrl={window.location.origin} enableLogging={true}>
          <NotificationsProvider>
            <ModalsProvider>
              <App {...props} />
              {showDevtools && <ReactQueryDevtools initialIsOpen={false} />}
            </ModalsProvider>
          </NotificationsProvider>
        </TransmitProvider>
      </QueryClientProvider>
    )
  },
})
