import env from '#start/env'

const queueConfig = {
  connection: {
    host: env.get('REDIS_HOST'),
    port: env.get('REDIS_PORT') ?? 6379,
    db: env.get('REDIS_DB') ?? 0,
  },
}

export default queueConfig
