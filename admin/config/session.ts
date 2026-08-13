import env from '#start/env'
import { shouldUseSecureCookies } from '../app/utils/cookie_security.js'
import { defineConfig, stores } from '@adonisjs/session'

const secureCookies = shouldUseSecureCookies(env.get('URL'))

const sessionConfig = defineConfig({
  enabled: true,
  cookieName: 'nomad-admin-session',

  /**
   * Keep the browser session available until it expires or the admin logs out.
   */
  clearWithBrowser: false,

  /**
   * Define how long to keep session data alive without activity.
   */
  age: '2h',

  /**
   * HTTP-only cookies keep the admin session marker out of client JavaScript.
   */
  cookie: {
    path: '/',
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'lax',
  },

  /**
   * Cookie storage avoids adding a users table for a single local admin gate.
   */
  store: env.get('SESSION_DRIVER', 'cookie'),

  /**
   * List of configured stores.
   */
  stores: {
    cookie: stores.cookie(),
  },
})

export default sessionConfig
