import type { HttpContext } from '@adonisjs/core/http'
import { MapRegionService } from '#services/map_region_service'
import {
  MapRegionOperationService,
  type RegionQueueEntry,
} from '#services/map_region_operation_service'
import { QueueService } from '#services/queue_service'
import type { MapRegionComponent } from '../../types/map_regions.js'
import { InstallMapRegionJob } from '#jobs/install_map_region_job'
import {
  MapRegionError,
  mapRegionComponents,
  mapRegionComponent,
  mapRegionId,
} from '../utils/map_region_catalog.js'
import {
  mapRegionRequestValidator,
  mapRegionCheckUpdatesValidator,
  mapRegionCancelValidator,
} from '#validators/maps'

export default class MapRegionsController {
  private operationsService() {
    const regions = new MapRegionService()
    return new MapRegionOperationService(regions, async () => {
      const result: RegionQueueEntry[] = []
      if (!MapRegionService.preparationConfigured()) return result
      for (const name of [InstallMapRegionJob.queue]) {
        const queue = QueueService.getInstance().getQueue(name)
        const [active, waiting, delayed] = await Promise.all([
          queue.getActive(0, 49),
          queue.getWaiting(0, 199),
          queue.getDelayed(0, 49),
        ])
        const blocking = active[0]?.data
        const blockingRecord = blocking?.regionId
          ? await regions.inspectRecord(blocking.regionId, blocking.component)
          : undefined
        const waitingFor = blocking
          ? `${blockingRecord?.region?.name || blocking.regionId} · routes`
          : undefined
        for (const [state, jobs] of [
          ['active', active],
          ['waiting', waiting],
          ['delayed', delayed],
        ] as const)
          for (const [position, job] of jobs.entries()) {
            const data = job.data
            if (!data?.regionId || data.component !== 'routing') continue
            result.push({
              state,
              regionId: data.regionId,
              component: data.component,
              operationId: data.operationId,
              waitingFor: state === 'waiting' ? waitingFor : undefined,
              position: state === 'waiting' ? position + 1 : undefined,
            })
          }
      }
      return result
    })
  }
  async operations({ response }: HttpContext) {
    try {
      return await this.operationsService().snapshot()
    } catch (error) {
      return this.failure(response, error)
    }
  }
  private failure(response: HttpContext['response'], error: unknown) {
    if (error instanceof MapRegionError)
      return response.status(error.status).send({ message: error.message })
    throw error
  }
  private requirePreparation() {
    if (!MapRegionService.preparationConfigured())
      throw new MapRegionError('The optional map preparation service is not configured.', 503)
  }
  async index({ response }: HttpContext) {
    try {
      const [state, operations] = await Promise.all([
        new MapRegionService().getState(),
        this.operationsService().snapshot(),
      ])
      for (const region of state.regions) {
        const operation = operations.operations.find((item) => item.regionId === region.id)
        if (operation)
          for (const component of ['routing'] as const)
            if (region.components[component] && operation.components[component])
              Object.assign(region.components[component]!, operation.components[component])
        for (const component of ['routing'] as const) {
          const pending = region.components[component]?.pendingProvider
          if (!pending) continue
          const status = operations.operations.find((item) => item.regionId === pending.regionId)
            ?.components[component]?.status
          if (status && ['queued', 'downloading', 'preparing', 'cancelling'].includes(status))
            pending.status = status as typeof pending.status
        }
      }
      return state
    } catch (error) {
      return this.failure(response, error)
    }
  }
  async install({ request, response }: HttpContext) {
    try {
      this.requirePreparation()
      const input = await request.validateUsing(mapRegionRequestValidator)
      await new MapRegionService().queueInstall(
        input.regionId,
        mapRegionComponents(input.components),
        InstallMapRegionJob.dispatch.bind(InstallMapRegionJob)
      )
      return response.status(202).send({ success: true })
    } catch (error) {
      return this.failure(response, error)
    }
  }
  async checkUpdates({ request, response }: HttpContext) {
    try {
      const input = await request.validateUsing(mapRegionCheckUpdatesValidator)
      return await new MapRegionService().checkUpdates(input.regionId)
    } catch (error) {
      return this.failure(response, error)
    }
  }
  async update({ request, response }: HttpContext) {
    try {
      this.requirePreparation()
      const input = await request.validateUsing(mapRegionRequestValidator)
      await new MapRegionService().queueUpdate(
        input.regionId,
        mapRegionComponents(input.components),
        InstallMapRegionJob.dispatch.bind(InstallMapRegionJob)
      )
      return response.status(202).send({ success: true })
    } catch (error) {
      return this.failure(response, error)
    }
  }
  async retry({ request, response }: HttpContext) {
    try {
      this.requirePreparation()
      const input = await request.validateUsing(mapRegionCancelValidator)
      const regions = new MapRegionService()
      const components = input.components || (['routing'] as const)
      const selected: MapRegionComponent[] = []
      for (const component of components)
        if (
          ['failed', 'cancelled'].includes((await regions.record(input.regionId, component)).status)
        )
          selected.push(component)
        else if (input.components)
          throw new MapRegionError(
            'This operation is not stopped. Refresh its status before retrying.',
            409
          )
      if (!selected.length)
        throw new MapRegionError('There is no failed or cancelled operation to retry.', 409)
      await regions.queueRetry(
        input.regionId,
        selected,
        InstallMapRegionJob.dispatch.bind(InstallMapRegionJob)
      )
      return response.status(202).send({ success: true })
    } catch (error) {
      return this.failure(response, error)
    }
  }
  async cancel({ request, response }: HttpContext) {
    try {
      const input = await request.validateUsing(mapRegionCancelValidator)
      await new MapRegionService().cancel(
        input.regionId,
        input.components || ['routing'],
        async (component) => InstallMapRegionJob.cancelPending(input.regionId, component)
      )
      return response.status(202).send({ success: true })
    } catch (error) {
      return this.failure(response, error)
    }
  }
  async refreshCatalog({ response }: HttpContext) {
    try {
      return await new MapRegionService().refreshCatalog()
    } catch (error) {
      return this.failure(response, error)
    }
  }
  async remove({ params, response }: HttpContext) {
    try {
      const id = mapRegionId(params.regionId),
        component = mapRegionComponent(params.component)
      await new MapRegionService().remove(id, component, async () => {
        await InstallMapRegionJob.removePending(id, component)
      })
      return { success: true }
    } catch (error) {
      return this.failure(response, error)
    }
  }
}
