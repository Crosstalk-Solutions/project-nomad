import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, targets } from '@adonisjs/core/logger'

const loggerConfig = defineConfig({
  default: 'app',

  /**
   * The loggers object can be used to define multiple loggers.
   * By default, we configure only one logger (named "app").
   */
  loggers: {
    app: {
      enabled: true,
      name: env.get('APP_NAME'),
      level: env.get('NODE_ENV') === 'production' ? env.get('LOG_LEVEL') : 'debug', // default to 'debug' in non-production envs
      transport: {
        targets:
          targets()
            .pushIf(!app.inProduction, targets.pretty())
            // Production: write JSON to both the persisted log file (for Debug
            // Info bundle export) AND stdout (so `docker logs nomad_admin` and
            // any external log aggregator can see runtime telemetry — RAG
            // retrieval scores, query rewrites, etc.). Writing to fd 1 via
            // pino/file is the standard way to do this; without it, prod
            // installs are effectively running blind from a debugger's POV.
            .pushIf(app.inProduction, targets.file({ destination: "/app/storage/logs/admin.log", mkdir: true }))
            .pushIf(app.inProduction, targets.file({ destination: 1 }))
            .toArray(),
      },
    },
  },
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> { }
}
