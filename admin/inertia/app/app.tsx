/// <reference path="../../adonisrc.ts" />
/// <reference path="../../config/inertia.ts" />

import '../css/app.css'
import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import ModalsProvider from '~/providers/ModalProvider'
import { TransmitProvider } from 'react-adonis-transmit'
import { generateUUID } from '~/lib/util'

const appName = import.meta.env.VITE_APP_NAME || 'Project N.O.M.A.D.'

// Patch the global crypto object for non-HTTPS/localhost contexts
if (!window.crypto?.randomUUID) {
  // @ts-ignore
  if (!window.crypto) window.crypto = {}
  // @ts-ignore
  window.crypto.randomUUID = generateUUID
}

createInertiaApp({
  progress: { color: '#5468FF' },

  title: (title) => `${title} - ${appName}`,

  resolve: (name) => {
    return resolvePageComponent(`../pages/${name}.tsx`, import.meta.glob('../pages/**/*.tsx'))
  },

  setup({ el, App, props }) {
    createRoot(el).render(
      <TransmitProvider baseUrl={window.location.origin} enableLogging={true}>
        <ModalsProvider>
          <App {...props} />
        </ModalsProvider>
      </TransmitProvider>
    )
  },
})
