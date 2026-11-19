import {
  MapService,
  MapPreflightAbortedError,
  MapPreflightTimeoutError,
} from '#services/map_service'
import MapMarker from '#models/map_marker'
import MarkerLayer from '#models/marker_layer'
import { MarkerLayerError, MarkerLayerService } from '#services/marker_layer_service'
import { exportFilename, MAX_IMPORT_BYTES, parsePinFile } from '../utils/marker_layer_io.js'
import { readFile, rm } from 'node:fs/promises'
import {
  assertNotPrivateUrl,
  downloadCollectionValidator,
  filenameParamValidator,
  mapExtractPreflightValidator,
  mapExtractValidator,
  remoteDownloadValidator,
  remoteDownloadValidatorOptional,
} from '#validators/common'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'

@inject()
export default class MapsController {
  constructor(
    private mapService: MapService,
    private markerLayerService: MarkerLayerService
  ) {}

  async index({ inertia }: HttpContext) {
    const baseAssetsCheck = await this.mapService.ensureBaseAssets()
    const [regionFiles, worldBasemapExists] = await Promise.all([
      this.mapService.listRegions(),
      this.mapService.checkWorldBasemapExists(),
    ])
    return inertia.render('maps', {
      maps: {
        baseAssetsExist: baseAssetsCheck,
        worldBasemapExists,
        regionFiles: regionFiles.files,
      },
    })
  }

  async downloadBaseAssets({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidatorOptional)
    if (payload.url) assertNotPrivateUrl(payload.url)
    await this.mapService.downloadBaseAssets(payload.url)
    return { success: true }
  }

  async setupWorldBasemap({ response }: HttpContext) {
    try {
      const ready = await this.mapService.provisionWorldBasemap()
      if (!ready) {
        return response.status(500).send({
          message:
            'Could not download the base map. Please connect this NOMAD to the internet and try again.',
        })
      }
      return { success: true }
    } catch {
      return response.status(500).send({
        message:
          'Could not download the base map. Please connect this NOMAD to the internet and try again.',
      })
    }
  }

  async downloadRemote({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidator)
    assertNotPrivateUrl(payload.url)
    const filename = await this.mapService.downloadRemote(payload.url)
    return {
      message: 'Download started successfully',
      filename,
      url: payload.url,
    }
  }

  async downloadCollection({ request }: HttpContext) {
    const payload = await request.validateUsing(downloadCollectionValidator)
    const resources = await this.mapService.downloadCollection(payload.slug)
    return {
      message: 'Collection download started successfully',
      slug: payload.slug,
      resources,
    }
  }

  // For providing a "preflight" check in the UI before actually starting a background download
  async downloadRemotePreflight({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidator)
    assertNotPrivateUrl(payload.url)
    const info = await this.mapService.downloadRemotePreflight(payload.url)
    return info
  }

  async fetchLatestCollections({}: HttpContext) {
    const success = await this.mapService.fetchLatestCollections()
    return { success }
  }

  async listCuratedCollections({}: HttpContext) {
    return await this.mapService.listCuratedCollections()
  }

  async listRegions({}: HttpContext) {
    return await this.mapService.listRegions()
  }

  async globalMapInfo({}: HttpContext) {
    return await this.mapService.getGlobalMapInfo()
  }

  async downloadGlobalMap({}: HttpContext) {
    const result = await this.mapService.downloadGlobalMap()
    return {
      message: 'Download started successfully',
      ...result,
    }
  }

  async listCountries({}: HttpContext) {
    return { countries: await this.mapService.listCountries() }
  }

  async listCountryGroups({}: HttpContext) {
    return { groups: await this.mapService.listCountryGroups() }
  }

  async extractPreflight({ request, response }: HttpContext) {
    const payload = await request.validateUsing(mapExtractPreflightValidator)

    // The picker fires a new estimate on every selection change and aborts the old
    // one. Kill the pmtiles child when the connection drops before we answer, or each
    // abandoned estimate keeps reading the remote archive for up to the full timeout.
    // Listen on the ServerResponse: IncomingMessage 'close' fires once the body is
    // read, not when the client goes away.
    const abort = new AbortController()
    const res = response.response
    const onClose = () => {
      if (!res.writableFinished) abort.abort()
    }
    res.once('close', onClose)

    try {
      return await this.mapService.extractPreflight(payload, abort.signal)
    } catch (error) {
      if (error instanceof MapPreflightAbortedError) {
        // Nobody is listening. Skip the error handler so this isn't logged as a 500.
        return
      }
      // A timeout is the user's selection being too big for this box, not a server
      // fault, so say so instead of a bare 500 (#1258).
      if (error instanceof MapPreflightTimeoutError) {
        return response.status(504).send({ message: error.message })
      }
      throw error
    }
  }

  async extractRegion({ request }: HttpContext) {
    const payload = await request.validateUsing(mapExtractValidator)
    const result = await this.mapService.extractRegion(payload)
    return {
      message: 'Extract started successfully',
      ...result,
    }
  }

  async styles({ request, response }: HttpContext) {
    // Automatically ensure base assets are present before generating styles
    const baseAssetsExist = await this.mapService.ensureBaseAssets()
    if (!baseAssetsExist) {
      return response.status(500).send({
        message:
          'Base map assets are missing and could not be downloaded. Please check your connection and try again.',
      })
    }

    const forwardedProto = request.headers()['x-forwarded-proto'];

    const protocol: string = forwardedProto
      ? (typeof forwardedProto === 'string' ? forwardedProto : request.protocol())
      : request.protocol();

    const styles = await this.mapService.generateStylesJSON(request.host(), protocol)
    return response.json(styles)
  }

  async delete({ request, response }: HttpContext) {
    const payload = await request.validateUsing(filenameParamValidator)

    try {
      await this.mapService.delete(payload.params.filename)
    } catch (error) {
      if (error.message === 'not_found') {
        return response.status(404).send({
          message: `Map file with key ${payload.params.filename} not found`,
        })
      }
      throw error // Re-throw any other errors and let the global error handler catch
    }

    return {
      message: 'Map file deleted successfully',
    }
  }

  // --- Map Markers ---

  async listMarkers({}: HttpContext) {
    return await MapMarker.query().orderBy('created_at', 'asc')
  }

  async createMarker({ request }: HttpContext) {
    const payload = await request.validateUsing(
      vine.compile(
        vine.object({
          name: vine.string().trim().minLength(1).maxLength(255),
          longitude: vine.number().min(-180).max(180),
          latitude: vine.number().min(-90).max(90),
          color: vine.string().trim().maxLength(20).optional(),
          custom_color: vine.string().trim().maxLength(7).nullable().optional(),
          icon: vine.string().trim().maxLength(50).nullable().optional(),
          icon_color: vine.string().trim().maxLength(7).nullable().optional(),
          visible: vine.boolean().optional(),
          notes: vine.string().trim().maxLength(500).nullable().optional(),
          marker_type: vine.string().trim().maxLength(20).optional(),
          layer_id: vine.number().withoutDecimals().positive().optional(),
        })
      )
    )

    // Older clients don't send a layer; an unknown one falls back too.
    const layer =
      (payload.layer_id !== undefined ? await MarkerLayer.find(payload.layer_id) : null) ??
      (await this.markerLayerService.defaultLayer())

    const marker = await MapMarker.create({
      layer_id: layer.id,
      name: payload.name,
      longitude: payload.longitude,
      latitude: payload.latitude,
      color: payload.color ?? 'orange',
      custom_color: payload.custom_color ?? null,
      icon: payload.icon ?? null,
      icon_color: payload.icon_color ?? null,
      visible: payload.visible ?? true,
      notes: payload.notes ?? null,
      marker_type: payload.marker_type ?? 'pin',
    })

    return marker
  }

  async updateMarker({ request, response }: HttpContext) {
    const { id } = request.params()
    const marker = await MapMarker.find(id)

    if (!marker) {
      return response.status(404).send({ message: 'Marker not found' })
    }

    const payload = await request.validateUsing(
      vine.compile(
        vine.object({
          name: vine.string().trim().minLength(1).maxLength(255).optional(),
          color: vine.string().trim().maxLength(20).optional(),
          custom_color: vine.string().trim().maxLength(7).nullable().optional(),
          icon: vine.string().trim().maxLength(50).nullable().optional(),
          icon_color: vine.string().trim().maxLength(7).nullable().optional(),
          visible: vine.boolean().optional(),
          longitude: vine.number().min(-180).max(180).optional(),
          latitude: vine.number().min(-90).max(90).optional(),
          notes: vine.string().trim().maxLength(500).nullable().optional(),
          marker_type: vine.string().trim().maxLength(20).optional(),
          layer_id: vine.number().withoutDecimals().positive().optional(),
        })
      )
    )

    if (payload.name !== undefined) marker.name = payload.name
    if (payload.color !== undefined) marker.color = payload.color
    if (payload.custom_color !== undefined) marker.custom_color = payload.custom_color
    if (payload.icon !== undefined) marker.icon = payload.icon
    if (payload.icon_color !== undefined) marker.icon_color = payload.icon_color
    if (payload.visible !== undefined) marker.visible = payload.visible
    if (payload.longitude !== undefined) marker.longitude = payload.longitude
    if (payload.latitude !== undefined) marker.latitude = payload.latitude
    if (payload.notes !== undefined) marker.notes = payload.notes
    if (payload.marker_type !== undefined) marker.marker_type = payload.marker_type

    await marker.save()

    // Moving layers goes through movePins so a route point brings its route along.
    if (payload.layer_id !== undefined && payload.layer_id !== marker.layer_id) {
      try {
        await this.markerLayerService.movePins([marker.id], payload.layer_id)
      } catch (error) {
        return this.sendLayerError(error, response)
      }
      await marker.refresh()
    }
    return marker
  }

  async moveMarkers({ request, response }: HttpContext) {
    const payload = await request.validateUsing(
      vine.compile(
        vine.object({
          marker_ids: vine.array(vine.number().withoutDecimals().positive()).minLength(1).maxLength(5000),
          layer_id: vine.number().withoutDecimals().positive(),
        })
      )
    )
    try {
      return await this.markerLayerService.movePins(payload.marker_ids, payload.layer_id)
    } catch (error) {
      return this.sendLayerError(error, response)
    }
  }

  async deleteMarker({ request, response }: HttpContext) {
    const { id } = request.params()
    const marker = await MapMarker.find(id)
    if (!marker) {
      return response.status(404).send({ message: 'Marker not found' })
    }
    await marker.delete()
    return { message: 'Marker deleted' }
  }

  // --- Marker layers (#1387) ---

  private sendLayerError(error: unknown, response: HttpContext['response']) {
    if (error instanceof MarkerLayerError) {
      return response.status(error.status).send({ message: error.message })
    }
    throw error
  }

  async listMarkerLayers({}: HttpContext) {
    return await this.markerLayerService.list()
  }

  async createMarkerLayer({ request }: HttpContext) {
    const { name } = await request.validateUsing(
      vine.compile(vine.object({ name: vine.string().trim().minLength(1).maxLength(100) }))
    )
    return await this.markerLayerService.create(name)
  }

  async updateMarkerLayer({ request, response }: HttpContext) {
    const { id } = request.params()
    const payload = await request.validateUsing(
      vine.compile(
        vine.object({
          name: vine.string().trim().minLength(1).maxLength(100).optional(),
          visible: vine.boolean().optional(),
        })
      )
    )
    try {
      return await this.markerLayerService.update(Number(id), payload)
    } catch (error) {
      return this.sendLayerError(error, response)
    }
  }

  async deleteMarkerLayer({ request, response }: HttpContext) {
    const { id } = request.params()
    try {
      const result = await this.markerLayerService.delete(Number(id))
      return { message: 'Layer deleted', ...result }
    } catch (error) {
      return this.sendLayerError(error, response)
    }
  }

  async exportMarkerLayers({ request, response }: HttpContext) {
    const raw = request.input('layer_id')
    const layerId = raw === undefined || raw === null || raw === '' ? undefined : Number(raw)
    if (layerId !== undefined && (!Number.isInteger(layerId) || layerId < 1)) {
      return response.status(422).send({ message: 'Invalid layer_id' })
    }
    try {
      const { file, label } = await this.markerLayerService.export(layerId)
      response.header('Content-Type', 'application/json; charset=utf-8')
      response.header('Content-Disposition', `attachment; filename="${exportFilename(label)}"`)
      return response.send(JSON.stringify(file, null, 2))
    } catch (error) {
      return this.sendLayerError(error, response)
    }
  }

  async importMarkerLayers({ request, response }: HttpContext) {
    const upload = request.file('file', { size: MAX_IMPORT_BYTES, extnames: ['json'] })
    try {
      if (!upload) {
        return response.status(422).send({ message: 'Choose a pin file to import.' })
      }
      if (!upload.isValid || !upload.tmpPath) {
        const reason = upload.errors[0]?.message ?? 'The file could not be read.'
        return response.status(422).send({ message: reason })
      }

      const payload = await request.validateUsing(
        vine.compile(
          vine.object({
            mode: vine.enum(['new', 'merge', 'replace'] as const),
            target_layer_id: vine.number().withoutDecimals().positive().optional(),
            name: vine.string().trim().minLength(1).maxLength(100).optional(),
          })
        )
      )

      let raw: unknown
      try {
        raw = JSON.parse(await readFile(upload.tmpPath, 'utf-8'))
      } catch {
        return response.status(422).send({ message: 'The file is not valid JSON.' })
      }
      const parsed = parsePinFile(raw)
      if (!parsed.ok) {
        return response.status(422).send({ message: parsed.errors[0], errors: parsed.errors })
      }

      return await this.markerLayerService.import(
        parsed.layers,
        payload.mode,
        payload.target_layer_id,
        payload.name
      )
    } catch (error) {
      return this.sendLayerError(error, response)
    } finally {
      if (upload?.tmpPath) await rm(upload.tmpPath, { force: true }).catch(() => {})
    }
  }
}
