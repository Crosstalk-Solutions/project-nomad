import type { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { MapRegionService } from '#services/map_region_service'
import type { MapRegionComponent } from '../../types/map_regions.js'
import { mapRegionId, mapRegionComponent, MapRegionError } from '../utils/map_region_catalog.js'
import { mapRegionJobId } from '../utils/map_region_operation.js'
import { MAP_REGION_QUEUE } from '../utils/map_region_queue.js'

export class InstallMapRegionJob {
  static queue = MAP_REGION_QUEUE
  static key = 'install-map-region'
  static async dispatch(regionId: string, component: MapRegionComponent) {
    const queue = QueueService.getInstance().getQueue(this.queue)
    const record = await new MapRegionService().record(regionId, component)
    if (['cancelling', 'cancelled'].includes(record.status)) return
    if (record.recoveryQueue && record.recoveryQueue !== this.queue) return
    if (!(await new MapRegionService().workflowDependency(regionId, component, record)).ready)
      return
    const operationId = record.operationId
    const jobId = mapRegionJobId(regionId, component, operationId)
    const previous = await queue.getJob(jobId)
    if (previous) {
      if (['active', 'waiting', 'delayed'].includes(await previous.getState())) return previous
      await previous.remove()
    }
    return queue.add(
      this.key,
      { regionId, component, operationId },
      { jobId, attempts: 1, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } }
    )
  }
  static async removePending(regionId: string, component: MapRegionComponent) {
    const record = await new MapRegionService().record(regionId, component)
    const base = mapRegionJobId(regionId, component)
    for (const key of [
      base,
      ...(record.operationId ? [mapRegionJobId(regionId, component, record.operationId)] : []),
    ]) {
      const job = await QueueService.getInstance().getQueue(this.queue).getJob(key)
      if (!job) continue
      try {
        await job.remove()
      } catch {
        throw new MapRegionError('This component is being prepared. Wait for it to finish.', 409)
      }
    }
  }
  /** Active jobs acknowledge the durable cancellation themselves. */
  static async cancelPending(regionId: string, component: MapRegionComponent) {
    const record = await new MapRegionService().record(regionId, component)
    const base = mapRegionJobId(regionId, component)
    let idle = true
    for (const key of [
      base,
      ...(record.operationId ? [mapRegionJobId(regionId, component, record.operationId)] : []),
    ]) {
      const job = await QueueService.getInstance().getQueue(this.queue).getJob(key)
      if (!job) continue
      if ((await job.getState()) === 'active') {
        idle = false
        continue
      }
      try {
        await job.remove()
      } catch {
        idle = false
      }
    }
    return idle
  }
  async handle(
    job: Job<{ regionId: string; component: MapRegionComponent; operationId?: string }>
  ) {
    const service = new MapRegionService()
    const queue = (this.constructor as typeof InstallMapRegionJob).queue
    if (
      !(await service.ownsMonitorQueue(
        job.data.regionId,
        job.data.component,
        job.data.operationId,
        queue
      ))
    )
      return
    const current = await service.record(job.data.regionId, job.data.component)
    // A pre-generation legacy job cannot adopt a newer operation. Recovery
    // enqueues the generation-specific replacement when a token already exists.
    if (!job.data.operationId && current.operationId) {
      if (current.status === 'cancelling')
        return service.install(
          mapRegionId(job.data.regionId),
          mapRegionComponent(job.data.component),
          current.operationId
        )
      return
    }
    const result = await service.install(
      mapRegionId(job.data.regionId),
      mapRegionComponent(job.data.component),
      job.data.operationId
    )
    await service.resumeWorkflow(
      job.data.regionId,
      InstallMapRegionJob.dispatch.bind(InstallMapRegionJob)
    )
    return result
  }
}
