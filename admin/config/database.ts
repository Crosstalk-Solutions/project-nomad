import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const dbConfig = defineConfig({
  connection: 'mysql',
  connections: {
    mysql: {
      client: 'mysql2',
      debug: env.get('NODE_ENV') === 'development',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT') ?? 3306, // Default MySQL port
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
        ssl: env.get('DB_SSL') ? {} : false,
      },
      pool: {
        min: 2,
        max: 15,
        acquireTimeoutMillis: 10000, // Fail fast (10s) instead of silently hanging for ~60s
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
  },
})

export default dbConfig