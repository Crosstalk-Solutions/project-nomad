import { test } from '@japa/runner'
import {
  partZipPath,
  parseDownloadState,
  deriveIngestPhase,
  resolveExpectedTotal,
} from '../../util/drug_labels.js'
import type {
  DrugLabelPartition,
  DrugDownloadStatus,
  DrugIngestPhaseStatus,
} from '../../types/drug_reference.js'

// ─── partZipPath ──────────────────────────────────────────────────────────────

test.group('partZipPath', () => {
  test('joins the storage base with the basename of the file URL', ({ assert }) => {
    const partition: DrugLabelPartition = {
      display_name: 'part 1',
      file: 'https://download.open.fda.gov/drug/label/drug-label-0001-of-0013.json.zip',
      size_mb: '128',
      records: 20000,
    }
    assert.equal(
      partZipPath('/app/storage/drug-data', partition),
      '/app/storage/drug-data/drug-label-0001-of-0013.json.zip'
    )
  })

  test('round-trips a recorded on-disk path (marker rebuild path)', ({ assert }) => {
    // resolvePartSource feeds the recorded path back in as `file`; partZipPath
    // must resolve to the same on-disk location.
    const recorded = '/app/storage/drug-data/drug-label-0007-of-0013.json.zip'
    const partition: DrugLabelPartition = {
      display_name: 'part 7',
      file: recorded,
      size_mb: '0',
      records: 0,
    }
    assert.equal(partZipPath('/app/storage/drug-data', partition), recorded)
  })
})

// ─── parseDownloadState ───────────────────────────────────────────────────────

test.group('parseDownloadState', () => {
  test('parses a valid marker JSON string', ({ assert }) => {
    const raw = JSON.stringify({
      export_date: '2026-06-06',
      totalParts: 2,
      totalRecords: 258914,
      parts: [
        { index: 0, name: 'part 1', path: '/app/storage/drug-data/p1.zip', bytes: 100 },
        { index: 1, name: 'part 2', path: '/app/storage/drug-data/p2.zip', bytes: 200 },
      ],
      completedAtMs: 1717718400000,
    })
    const marker = parseDownloadState(raw)
    assert.isNotNull(marker)
    assert.equal(marker!.export_date, '2026-06-06')
    assert.equal(marker!.totalParts, 2)
    assert.equal(marker!.totalRecords, 258914)
    assert.lengthOf(marker!.parts, 2)
    assert.equal(marker!.parts[1].path, '/app/storage/drug-data/p2.zip')
    assert.equal(marker!.completedAtMs, 1717718400000)
  })

  test('defaults totalRecords to 0 for an older marker that predates the field', ({
    assert,
  }) => {
    const raw = JSON.stringify({
      export_date: '2026-06-06',
      totalParts: 1,
      parts: [{ index: 0, name: 'part 1', path: '/app/storage/drug-data/p1.zip', bytes: 100 }],
    })
    const marker = parseDownloadState(raw)
    assert.isNotNull(marker)
    assert.equal(marker!.totalRecords, 0)
  })

  test('returns null for a never-set (null) value', ({ assert }) => {
    assert.isNull(parseDownloadState(null))
  })

  test('returns null for malformed JSON', ({ assert }) => {
    assert.isNull(parseDownloadState('{not json'))
  })

  test('returns null when parts is empty', ({ assert }) => {
    const raw = JSON.stringify({ export_date: '2026-06-06', totalParts: 0, parts: [] })
    assert.isNull(parseDownloadState(raw))
  })

  test('returns null when a part is missing its path', ({ assert }) => {
    const raw = JSON.stringify({
      export_date: '2026-06-06',
      totalParts: 1,
      parts: [{ index: 0, name: 'part 1', bytes: 100 }],
    })
    assert.isNull(parseDownloadState(raw))
  })

  test('defaults index/name/bytes when absent on an otherwise-valid part', ({ assert }) => {
    const raw = JSON.stringify({
      export_date: '2026-06-06',
      totalParts: 1,
      parts: [{ path: '/app/storage/drug-data/p1.zip' }],
    })
    const marker = parseDownloadState(raw)
    assert.isNotNull(marker)
    assert.equal(marker!.parts[0].index, 0)
    assert.equal(marker!.parts[0].name, '')
    assert.equal(marker!.parts[0].bytes, 0)
  })
})

// ─── deriveIngestPhase ────────────────────────────────────────────────────────

function dl(state: DrugDownloadStatus['state']): DrugDownloadStatus {
  return { state, partsDone: 0, totalParts: 13, currentPartName: null }
}
function ing(state: DrugIngestPhaseStatus['state']): DrugIngestPhaseStatus {
  return { state, records: 0, expectedTotal: 0, partsDone: 0, totalParts: 13, currentPartName: null }
}

test.group('deriveIngestPhase', () => {
  test('idle when nothing has run and no rows exist', ({ assert }) => {
    assert.equal(deriveIngestPhase(dl('idle'), ing('idle'), 0), 'idle')
  })

  test('downloading when the download phase is running', ({ assert }) => {
    assert.equal(deriveIngestPhase(dl('running'), ing('idle'), 0), 'downloading')
  })

  test('downloaded when the download completed and ingest has not started', ({ assert }) => {
    assert.equal(deriveIngestPhase(dl('completed'), ing('idle'), 0), 'downloaded')
  })

  test('ingesting when the ingest phase is running', ({ assert }) => {
    assert.equal(deriveIngestPhase(dl('completed'), ing('running'), 0), 'ingesting')
  })

  test('ready when the ingest phase completed', ({ assert }) => {
    assert.equal(deriveIngestPhase(dl('completed'), ing('completed'), 250000), 'ready')
  })

  test('ready when idle but rows already exist from a past run', ({ assert }) => {
    assert.equal(deriveIngestPhase(dl('idle'), ing('idle'), 250000), 'ready')
  })

  test('failed when the ingest phase failed', ({ assert }) => {
    assert.equal(deriveIngestPhase(dl('completed'), ing('failed'), 0), 'failed')
  })

  test('failed when the download phase failed', ({ assert }) => {
    assert.equal(deriveIngestPhase(dl('failed'), ing('idle'), 0), 'failed')
  })

  // A failed download does NOT force ingest to fail: if ingest is running off
  // already-downloaded parts, the running phase wins.
  test('a running ingest outranks a sibling download failure', ({ assert }) => {
    assert.equal(deriveIngestPhase(dl('failed'), ing('running'), 0), 'ingesting')
  })

  // A failed ingest does NOT force download to fail: a running download wins.
  test('a running download outranks a sibling ingest failure', ({ assert }) => {
    assert.equal(deriveIngestPhase(dl('running'), ing('failed'), 0), 'downloading')
  })

  // A completed download + failed ingest surfaces 'failed' (ingest is terminal,
  // download isn't running) — the manual re-ingest path applies.
  test('completed download with a failed ingest reports failed', ({ assert }) => {
    assert.equal(deriveIngestPhase(dl('completed'), ing('failed'), 0), 'failed')
  })
})

// ─── resolveExpectedTotal ─────────────────────────────────────────────────────

test.group('resolveExpectedTotal', () => {
  test('prefers the real manifest total when known', ({ assert }) => {
    assert.equal(resolveExpectedTotal(258914, 13, 5000), 258914)
  })

  // The regression: total_records 0 must NOT win via `?? fallback` (0 is not
  // nullish). 0 means unknown → fall through to the parts-based estimate.
  test('treats a manifest total of 0 as unknown and uses the parts estimate', ({ assert }) => {
    assert.equal(resolveExpectedTotal(0, 13, 5000), 13 * 20000)
  })

  test('treats an undefined manifest total as unknown and uses the parts estimate', ({
    assert,
  }) => {
    assert.equal(resolveExpectedTotal(undefined, 13, 5000), 13 * 20000)
  })

  test('falls back to the live row count when parts is also unknown', ({ assert }) => {
    assert.equal(resolveExpectedTotal(0, 0, 5000), 5000)
    assert.equal(resolveExpectedTotal(undefined, undefined, 5000), 5000)
  })

  test('honors a custom per-part estimate', ({ assert }) => {
    assert.equal(resolveExpectedTotal(0, 4, 0, 25000), 4 * 25000)
  })
})
