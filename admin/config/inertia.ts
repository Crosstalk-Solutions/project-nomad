import KVStore from '#models/kv_store'
import { SystemService } from '#services/system_service'
import { defineConfig } from '@adonisjs/inertia'
import type { InferSharedProps } from '@adonisjs/inertia/types'
import env from '#start/env'

const inertiaConfig = defineConfig({
  /**
   * Path to the Edge view that will be used as the root view for Inertia responses
   */
  rootView: 'inertia_layout',

  /**
   * Data that should be shared with all rendered pages
   */
  sharedData: {
    appVersion: () => SystemService.getAppVersion(),
    environment: process.env.NODE_ENV || 'production',
    aiAssistantName: async () => {
      const customName = await KVStore.getValue('ai.assistantCustomName')
      return (customName && customName.trim()) ? customName : 'AI Assistant'
    },
    dozzlePort: () => env.get('DOZZLE_PORT', 9999),
  },

  /**
   * Options for the server-side rendering
   */
  ssr: {
    enabled: false,
    entrypoint: 'inertia/app/ssr.tsx'
  }
})

export default inertiaConfig

declare module '@adonisjs/inertia/types' {
  export interface SharedProps extends InferSharedProps<typeof inertiaConfig> {}
}