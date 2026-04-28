import logger from '@adonisjs/core/services/logger'
import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Ensures the nomad_qdrant container has the `unless-stopped` restart policy.
 *
 * Existing installations may have been created before this policy was enforced
 * in the service seeder. Docker allows updating a container's restart policy
 * without recreating it via the container.update() API.
 *
 * This provider runs once on every admin startup. If the policy is already
 * correct, the check is a no-op.
 */
export default class QdrantRestartPolicyProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    if (this.app.getEnvironment() !== 'web') return

    setImmediate(async () => {
      try {
        const Service = (await import('#models/service')).default
        const { SERVICE_NAMES } = await import('../constants/service_names.js')
        const Docker = (await import('dockerode')).default

        const qdrantService = await Service.query()
          .where('service_name', SERVICE_NAMES.QDRANT)
          .first()

        if (!qdrantService?.installed) {
          logger.info('[QdrantRestartPolicyProvider] Qdrant not installed — skipping restart policy check.')
          return
        }

        const docker = new Docker({ socketPath: '/var/run/docker.sock' })
        const containers = await docker.listContainers({ all: true })
        const containerInfo = containers.find((c) => c.Names.includes(`/${SERVICE_NAMES.QDRANT}`))

        if (!containerInfo) {
          logger.warn('[QdrantRestartPolicyProvider] Qdrant container not found — skipping restart policy check.')
          return
        }

        const container = docker.getContainer(containerInfo.Id)
        const inspected = await container.inspect()
        const currentPolicy = inspected.HostConfig?.RestartPolicy?.Name

        if (currentPolicy === 'unless-stopped') {
          logger.info('[QdrantRestartPolicyProvider] Qdrant already has unless-stopped restart policy — no update needed.')
          return
        }

        logger.info(`[QdrantRestartPolicyProvider] Qdrant restart policy is "${currentPolicy ?? 'none'}" — updating to unless-stopped.`)
        await container.update({ RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 } })
        logger.info('[QdrantRestartPolicyProvider] Qdrant restart policy updated successfully.')
      } catch (err: any) {
        logger.error(`[QdrantRestartPolicyProvider] Failed to update Qdrant restart policy: ${err.message}`)
        // Non-fatal: the container will still run, just without auto-restart on crash.
      }
    })
  }
}
