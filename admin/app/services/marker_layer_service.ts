import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import MapMarker from '#models/map_marker'
import MarkerLayer from '#models/marker_layer'
import { SystemService } from '#services/system_service'
import {
  buildPinFile,
  dedupeForMerge,
  type PinFile,
  type PinLayerRecord,
  type PinRecord,
  remapRouteIds,
  summarizeMarkers,
  uniqueLayerName,
} from '../utils/marker_layer_io.js'

export type ImportMode = 'new' | 'merge' | 'replace'

export interface ImportResult {
  mode: ImportMode
  layers: Array<{ id: number; name: string }>
  imported_pins: number
  imported_routes: number
  skipped_duplicates: number
}

export class MarkerLayerError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

const INSERT_BATCH = 500

/** Map pin layers (#1387): CRUD, export and import. */
export class MarkerLayerService {
  async list() {
    const layers = await MarkerLayer.query()
      .withCount('markers')
      .orderBy('sort_order', 'asc')
      .orderBy('id', 'asc')
    return layers.map((layer) => ({
      ...layer.serialize(),
      marker_count: Number(layer.$extras.markers_count ?? 0),
    }))
  }

  /** The layer new pins go into when a client doesn't say (older API clients). */
  async defaultLayer(): Promise<MarkerLayer> {
    const layer = await MarkerLayer.query().orderBy('sort_order', 'asc').orderBy('id', 'asc').first()
    if (layer) return layer
    // Only reachable if the table was emptied by hand; recreate the default.
    return MarkerLayer.create({ name: 'My Pins', visible: true, sort_order: 0 })
  }

  async create(name: string) {
    const taken = (await MarkerLayer.query().select('name')).map((l) => l.name)
    const sortOrder = Number((await MarkerLayer.query().max('sort_order as max').first())?.$extras.max ?? 0)
    return MarkerLayer.create({
      name: uniqueLayerName(name, taken),
      visible: true,
      sort_order: sortOrder + 1,
    })
  }

  async update(id: number, changes: { name?: string; visible?: boolean }) {
    const layer = await MarkerLayer.find(id)
    if (!layer) throw new MarkerLayerError('Layer not found', 404)
    if (changes.name !== undefined && changes.name !== layer.name) {
      const taken = (await MarkerLayer.query().whereNot('id', id).select('name')).map((l) => l.name)
      layer.name = uniqueLayerName(changes.name, taken)
    }
    if (changes.visible !== undefined) layer.visible = changes.visible
    await layer.save()
    return layer
  }

  async delete(id: number): Promise<{ deleted_markers: number }> {
    return db.transaction(async (trx) => {
      const layer = await MarkerLayer.query({ client: trx }).where('id', id).forUpdate().first()
      if (!layer) throw new MarkerLayerError('Layer not found', 404)
      const count = Number((await MarkerLayer.query({ client: trx }).count('* as total').first())?.$extras.total ?? 0)
      if (count <= 1) {
        throw new MarkerLayerError('You need at least one layer. Create another before deleting this one.', 409)
      }
      // Explicit, so the count is accurate; the FK cascade is only a backstop.
      const deleted = await MapMarker.query({ client: trx }).where('layer_id', id).delete()
      await layer.useTransaction(trx).delete()
      return { deleted_markers: Number(Array.isArray(deleted) ? deleted[0] : deleted) || 0 }
    })
  }

  /**
   * Move pins into another layer. A route moves as a whole: moving any of its
   * points brings the rest along, so a route never ends up split across layers.
   */
  async movePins(markerIds: number[], layerId: number): Promise<{ moved: number; layer_id: number }> {
    return db.transaction(async (trx) => {
      const layer = await MarkerLayer.query({ client: trx }).where('id', layerId).first()
      if (!layer) throw new MarkerLayerError('Layer not found', 404)

      const selected = await MapMarker.query({ client: trx })
        .whereIn('id', markerIds)
        .select('id', 'route_id')
      const routeIds = [...new Set(selected.map((m) => m.route_id).filter((id): id is string => !!id))]

      const query = MapMarker.query({ client: trx }).where((q) => {
        q.whereIn('id', selected.map((m) => m.id))
        if (routeIds.length > 0) q.orWhereIn('route_id', routeIds)
      })
      const moving = await query.clone().select('id')
      if (moving.length > 0) {
        await MapMarker.query({ client: trx })
          .whereIn('id', moving.map((m) => m.id))
          .update({ layer_id: layer.id })
      }
      return { moved: moving.length, layer_id: layer.id }
    })
  }

  async export(layerId?: number): Promise<{ file: PinFile; label: string }> {
    const query = MarkerLayer.query().orderBy('sort_order', 'asc').orderBy('id', 'asc')
    if (layerId !== undefined) query.where('id', layerId)
    const layers = await query
    if (layerId !== undefined && layers.length === 0) {
      throw new MarkerLayerError('Layer not found', 404)
    }

    const markers = await MapMarker.query()
      .whereIn('layer_id', layers.map((l) => l.id))
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
    const byLayer = new Map<number, PinRecord[]>()
    for (const marker of markers) {
      const list = byLayer.get(marker.layer_id) ?? []
      list.push(marker as unknown as PinRecord)
      byLayer.set(marker.layer_id, list)
    }

    let appVersion: string | null = null
    try {
      appVersion = SystemService.getAppVersion()
    } catch {
      // Version is informational only.
    }

    const file = buildPinFile(
      layers.map((layer) => ({
        name: layer.name,
        visible: layer.visible,
        markers: byLayer.get(layer.id) ?? [],
      })),
      appVersion
    )
    return { file, label: layerId !== undefined ? layers[0].name : 'all-layers' }
  }

  /**
   * Import a parsed pin file. Runs in one transaction, so a failure part-way
   * leaves every existing layer and pin exactly as it was.
   */
  async import(
    parsedLayers: PinLayerRecord[],
    mode: ImportMode,
    targetLayerId?: number,
    newLayerName?: string
  ): Promise<ImportResult> {
    const layers = remapRouteIds(parsedLayers, randomUUID)

    return db.transaction(async (trx) => {
      const insert = async (layerId: number, markers: PinRecord[]) => {
        for (let i = 0; i < markers.length; i += INSERT_BATCH) {
          await MapMarker.createMany(
            markers.slice(i, i + INSERT_BATCH).map((m) => ({ ...m, layer_id: layerId })),
            { client: trx }
          )
        }
      }

      if (mode === 'new') {
        const taken = (await MarkerLayer.query({ client: trx }).select('name')).map((l) => l.name)
        let sortOrder = Number(
          (await MarkerLayer.query({ client: trx }).max('sort_order as max').first())?.$extras.max ?? 0
        )
        const created: Array<{ id: number; name: string }> = []
        let pins = 0
        let routes = 0
        for (const layer of layers) {
          const requested = layers.length === 1 && newLayerName ? newLayerName : layer.name
          const name = uniqueLayerName(requested, taken)
          taken.push(name)
          // Shown on arrival so the user sees what they just imported.
          const row = await MarkerLayer.create(
            { name, visible: true, sort_order: ++sortOrder },
            { client: trx }
          )
          await insert(row.id, layer.markers)
          const summary = summarizeMarkers(layer.markers)
          pins += summary.pins
          routes += summary.routes
          created.push({ id: row.id, name: row.name })
        }
        return { mode, layers: created, imported_pins: pins, imported_routes: routes, skipped_duplicates: 0 }
      }

      if (targetLayerId === undefined) {
        throw new MarkerLayerError('Choose the layer to import into.', 422)
      }
      const target = await MarkerLayer.query({ client: trx }).where('id', targetLayerId).forUpdate().first()
      if (!target) throw new MarkerLayerError('Layer not found', 404)

      // Merge and replace fold every layer in the file into the one target.
      const incoming = layers.flatMap((layer) => layer.markers)
      let toInsert = incoming
      let skipped = 0

      if (mode === 'replace') {
        await MapMarker.query({ client: trx }).where('layer_id', target.id).delete()
      } else {
        const existing = await MapMarker.query({ client: trx }).where('layer_id', target.id)
        const result = dedupeForMerge(existing as unknown as PinRecord[], incoming)
        toInsert = result.kept
        skipped = result.skipped
      }

      await insert(target.id, toInsert)
      const summary = summarizeMarkers(toInsert)
      return {
        mode,
        layers: [{ id: target.id, name: target.name }],
        imported_pins: summary.pins,
        imported_routes: summary.routes,
        skipped_duplicates: skipped,
      }
    })
  }
}
