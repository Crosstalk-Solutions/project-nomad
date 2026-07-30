import * as assert from 'node:assert/strict'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'

import { convertRasterMbtilesToPmtiles } from '../../app/services/raster_pmtiles_converter.js'
import { parseMapArchiveManifest } from '../../app/utils/map_styles.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

test('converts a provider-neutral raster MBTiles archive into verified manifest metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nomad-raster-conversion-'))
  temporaryDirectories.push(directory)
  const sourcePath = join(directory, 'provider-output.mbtiles')
  await writeFile(sourcePath, 'mbtiles input')

  const result = await convertRasterMbtilesToPmtiles(
    {
      sourceMbtilesPath: sourcePath,
      outputDirectory: directory,
      filename: 'imagery-ok.pmtiles',
      resourceId: 'aerial-us-ok',
      role: 'aerial',
      regionId: 'us-ok',
      tileSize: 256,
      attribution: 'USDA, USGS The National Map: Orthoimagery.',
      sourceUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer',
      sourceVersion: '3.3.0',
    },
    {
      now: () => new Date('2026-07-30T12:00:00.000Z'),
      runPmtiles: async (args) => {
        if (args[0] === 'convert') {
          await copyFile(args[1], args[2])
          await writeFile(args[2], 'pmtiles bytes')
          return { stdout: '', stderr: '' }
        }
        if (args[0] === 'verify') return { stdout: '', stderr: '' }
        if (args[0] === 'show') {
          return {
            stdout: JSON.stringify({
              tile_compression: 'none',
              tile_type: 'jpg',
              minzoom: 0,
              maxzoom: 14,
              bounds: [-103, 33, -94, 37],
            }),
            stderr: '',
          }
        }
        throw new Error(`Unexpected pmtiles command: ${args[0]}`)
      },
    }
  )

  assert.equal(result.outputPath, join(directory, 'imagery-ok.pmtiles'))
  assert.equal(await readFile(result.outputPath, 'utf8'), 'pmtiles bytes')
  assert.deepEqual(result.archive, {
    filename: 'imagery-ok.pmtiles',
    resourceId: 'aerial-us-ok',
    kind: 'raster',
    role: 'aerial',
    regionId: 'us-ok',
    tileFormat: 'jpeg',
    tileSize: 256,
    minzoom: 0,
    maxzoom: 14,
    bounds: [-103, 33, -94, 37],
    attribution: 'USDA, USGS The National Map: Orthoimagery.',
    sourceUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer',
    sourceVersion: '3.3.0',
    sha256: 'fca0b5920b5ead8723f66020d314eb37ebda06c9e5cb92acf186afa2fc67e789',
    installedBytes: 13,
    verifiedAt: '2026-07-30T12:00:00.000Z',
  })
  const parsed = parseMapArchiveManifest({
    schemaVersion: 1,
    archives: { [result.archive.filename]: result.archive },
  })
  assert.equal(parsed.status, 'valid')
  assert.deepEqual(parsed.archives, [result.archive])
})

test('does not overwrite an archive installed concurrently during conversion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nomad-raster-conversion-'))
  temporaryDirectories.push(directory)
  const sourcePath = join(directory, 'provider-output.mbtiles')
  const outputPath = join(directory, 'imagery-ok.pmtiles')
  await writeFile(sourcePath, 'mbtiles input')

  await assert.rejects(
    convertRasterMbtilesToPmtiles(
      {
        sourceMbtilesPath: sourcePath,
        outputDirectory: directory,
        filename: 'imagery-ok.pmtiles',
        resourceId: 'aerial-us-ok',
        role: 'aerial',
        regionId: 'us-ok',
        tileSize: 256,
        attribution: 'USDA, USGS The National Map: Orthoimagery.',
        sourceUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer',
        sourceVersion: '3.3.0',
      },
      {
        runPmtiles: async (args) => {
          if (args[0] === 'convert') {
            await writeFile(args[2], 'converted archive')
            return { stdout: '', stderr: '' }
          }
          if (args[0] === 'verify') return { stdout: '', stderr: '' }
          if (args[0] === 'show') {
            await writeFile(outputPath, 'concurrent archive')
            return {
              stdout: JSON.stringify({
                tile_type: 'png',
                minzoom: 0,
                maxzoom: 14,
                bounds: [-103, 33, -94, 37],
              }),
              stderr: '',
            }
          }
          throw new Error(`Unexpected pmtiles command: ${args[0]}`)
        },
      }
    ),
    /already exists/
  )

  assert.equal(await readFile(outputPath, 'utf8'), 'concurrent archive')
})
