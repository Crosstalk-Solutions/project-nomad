import { test } from '@japa/runner'
import {
  mapDrugLabelRecord,
  normalizeDrugName,
  parseDrugLabelManifest,
  type OpenFdaLabelRecord,
} from '../../util/drug_labels.js'

// ─── mapDrugLabelRecord ───────────────────────────────────────────────────────

test.group('mapDrugLabelRecord', () => {
  // Case 1: Full Rx record → all fields mapped; sections flattened with \n\n.
  test('maps a full Rx record with all fields present', ({ assert }) => {
    const record: OpenFdaLabelRecord = {
      set_id: 'abc-123',
      id: 'rev-001',
      version: '3',
      effective_time: '20240115',
      openfda: {
        brand_name: ['Xarelto'],
        generic_name: ['rivaroxaban'],
        manufacturer_name: ['Janssen Pharmaceuticals, Inc.'],
        product_ndc: ['50458-578-03'],
        route: ['ORAL'],
        product_type: ['HUMAN PRESCRIPTION DRUG'],
      },
      indications_and_usage: ['Indicated for treatment of DVT.', 'Also for PE.'],
      dosage_and_administration: ['15 mg once daily with food.'],
      warnings: ['Premature discontinuation increases risk of thrombotic events.'],
      boxed_warning: ['PREMATURE DISCONTINUATION OF ANTICOAGULANTS MAY CAUSE THROMBOSIS.'],
      drug_interactions: ['Avoid use with combined P-gp and CYP3A4 inhibitors.'],
      contraindications: ['Active pathological bleeding.'],
      when_using: [],
      stop_use: [],
    }

    const row = mapDrugLabelRecord(record)
    assert.isNotNull(row)
    assert.equal(row!.set_id, 'abc-123')
    assert.equal(row!.spl_id, 'rev-001')
    assert.equal(row!.version, '3')
    assert.equal(row!.brand_name, 'Xarelto')
    assert.equal(row!.generic_name, 'rivaroxaban')
    assert.equal(row!.manufacturer, 'Janssen Pharmaceuticals, Inc.')
    assert.equal(row!.product_ndc, '50458-578-03')
    assert.equal(row!.route, 'ORAL')
    assert.equal(row!.product_type, 'HUMAN PRESCRIPTION DRUG')
    assert.equal(row!.source_updated_at, '2024-01-15')
    // Sections flattened with \n\n
    assert.equal(row!.indications, 'Indicated for treatment of DVT.\n\nAlso for PE.')
    assert.equal(row!.dosage, '15 mg once daily with food.')
    assert.isNotNull(row!.boxed_warning)
    assert.isNotNull(row!.drug_interactions)
    assert.isNotNull(row!.contraindications)
    // Empty arrays → null
    assert.isNull(row!.when_using)
    assert.isNull(row!.stop_use)
  })

  // Case 2: OTC record with when_using/stop_use, absent drug_interactions/contraindications/boxed_warning
  test('maps an OTC record with absent Rx sections — no throw', ({ assert }) => {
    const record: OpenFdaLabelRecord = {
      set_id: 'otc-set-456',
      openfda: {
        brand_name: ['Tylenol'],
        generic_name: ['acetaminophen'],
        product_type: ['HUMAN OTC DRUG'],
        route: ['ORAL'],
      },
      indications_and_usage: ['For temporary relief of minor pain.'],
      when_using: ['Do not use with other acetaminophen products.'],
      stop_use: ['Stop use if symptoms persist more than 3 days.'],
      // drug_interactions, contraindications, boxed_warning intentionally absent
    }

    const row = mapDrugLabelRecord(record)
    assert.isNotNull(row)
    assert.isNull(row!.drug_interactions)
    assert.isNull(row!.contraindications)
    assert.isNull(row!.boxed_warning)
    assert.isNotNull(row!.when_using)
    assert.isNotNull(row!.stop_use)
    assert.equal(row!.product_type, 'HUMAN OTC DRUG')
  })

  // Case 3: Missing set_id → returns null
  test('returns null when set_id is missing', ({ assert }) => {
    const record: OpenFdaLabelRecord = {
      id: 'rev-xyz',
      openfda: { brand_name: ['Advil'] },
    }
    assert.isNull(mapDrugLabelRecord(record))
  })

  test('returns null when set_id is empty string', ({ assert }) => {
    const record: OpenFdaLabelRecord = { set_id: '', openfda: { brand_name: ['Advil'] } }
    assert.isNull(mapDrugLabelRecord(record))
  })

  // Case 4: Multi-element generic_name/product_ndc/route → joined with ", "
  test('joins multi-element generic_name, product_ndc, route with comma', ({ assert }) => {
    const record: OpenFdaLabelRecord = {
      set_id: 'multi-001',
      openfda: {
        generic_name: ['amoxicillin', 'clavulanate potassium'],
        product_ndc: ['0069-0070-41', '0069-0070-83'],
        route: ['ORAL', 'SUBLINGUAL'],
      },
    }
    const row = mapDrugLabelRecord(record)
    assert.isNotNull(row)
    assert.equal(row!.generic_name, 'amoxicillin, clavulanate potassium')
    assert.equal(row!.product_ndc, '0069-0070-41, 0069-0070-83')
    assert.equal(row!.route, 'ORAL, SUBLINGUAL')
  })

  // Case 5: Multi-element brand_name → first element only
  test('takes only the first element of brand_name', ({ assert }) => {
    const record: OpenFdaLabelRecord = {
      set_id: 'brand-multi-001',
      openfda: { brand_name: ['Augmentin', 'Amoxicillin-Clavulanate'] },
    }
    const row = mapDrugLabelRecord(record)
    assert.isNotNull(row)
    assert.equal(row!.brand_name, 'Augmentin')
  })

  // Case 6: effective_time parsing
  test('parses effective_time YYYYMMDD to YYYY-MM-DD', ({ assert }) => {
    const record: OpenFdaLabelRecord = { set_id: 's1', effective_time: '20240115' }
    assert.equal(mapDrugLabelRecord(record)!.source_updated_at, '2024-01-15')
  })

  test('returns null source_updated_at for garbage effective_time', ({ assert }) => {
    const record: OpenFdaLabelRecord = { set_id: 's2', effective_time: 'garbage' }
    assert.isNull(mapDrugLabelRecord(record)!.source_updated_at)
  })

  test('returns null source_updated_at when effective_time is missing', ({ assert }) => {
    const record: OpenFdaLabelRecord = { set_id: 's3' }
    assert.isNull(mapDrugLabelRecord(record)!.source_updated_at)
  })

  // Case 7: Empty-array section → null (not "")
  test('empty section array returns null, not empty string', ({ assert }) => {
    const record: OpenFdaLabelRecord = {
      set_id: 's4',
      indications_and_usage: [],
      warnings: [],
    }
    const row = mapDrugLabelRecord(record)!
    assert.isNull(row.indications)
    assert.isNull(row.warnings)
  })

  // Case 8: product_type handling
  test('takes product_type from openfda array first element', ({ assert }) => {
    const r1: OpenFdaLabelRecord = {
      set_id: 's5',
      openfda: { product_type: ['HUMAN OTC DRUG'] },
    }
    assert.equal(mapDrugLabelRecord(r1)!.product_type, 'HUMAN OTC DRUG')

    const r2: OpenFdaLabelRecord = { set_id: 's6' }
    assert.isNull(mapDrugLabelRecord(r2)!.product_type)
  })

  // Case 9: Section text with embedded whitespace → trimmed, joined properly
  test('trims and joins sections with embedded whitespace', ({ assert }) => {
    const record: OpenFdaLabelRecord = {
      set_id: 's7',
      warnings: ['  Risk of bleeding.  ', '\n\nDo not crush.\n'],
    }
    const row = mapDrugLabelRecord(record)!
    // The two elements are joined with \n\n, then the whole result trimmed.
    // Individual elements may have internal whitespace but the join/trim
    // removes leading/trailing blank lines from the whole blob.
    assert.isNotNull(row.warnings)
    assert.isFalse(row.warnings!.startsWith('\n'))
    assert.isFalse(row.warnings!.endsWith('\n'))
    assert.include(row.warnings!, '  Risk of bleeding.  \n\n\n\nDo not crush.')
  })

  // Case 10: over-long set_id (> 64) → null (the idempotency key can't be truncated)
  test('returns null when set_id exceeds the 64-char key width', ({ assert }) => {
    const record: OpenFdaLabelRecord = {
      set_id: 'x'.repeat(65),
      openfda: { brand_name: ['Foo'] },
    }
    assert.isNull(mapDrugLabelRecord(record))
  })

  // Case 11: a generic_name join longer than the column width is clamped to fit
  test('clamps an over-long generic_name to the column width (512)', ({ assert }) => {
    // A combination product can join many active ingredients well past 512 chars.
    const manyActives = Array.from({ length: 60 }, (_, i) => `ingredient-number-${i}`)
    const record: OpenFdaLabelRecord = {
      set_id: 'combo-1',
      openfda: { brand_name: ['MegaVitamin'], generic_name: manyActives },
    }
    const row = mapDrugLabelRecord(record)!
    assert.isNotNull(row.generic_name)
    assert.isTrue(row.generic_name!.length <= 512)
    assert.isTrue(row.searchable_name!.length <= 768)
  })
})

// ─── normalizeDrugName ────────────────────────────────────────────────────────

test.group('normalizeDrugName', () => {
  // Case 1
  test('basic brand + generic combination', ({ assert }) => {
    assert.equal(normalizeDrugName('Tylenol', 'acetaminophen'), 'tylenol acetaminophen')
  })

  // Case 2
  test('multi-word brand + generic', ({ assert }) => {
    assert.equal(
      normalizeDrugName('Tylenol Extra Strength', 'acetaminophen'),
      'tylenol extra strength acetaminophen'
    )
  })

  // Case 3: Duplicate tokens deduped
  test('deduplicates tokens preserving order', ({ assert }) => {
    assert.equal(normalizeDrugName('Silicea', 'SILICEA'), 'silicea')
  })

  // Case 4: Punctuation stripped to spaces
  test('strips punctuation to spaces', ({ assert }) => {
    assert.equal(normalizeDrugName('Co-Q10 (50 mg)', null), 'co q10 50 mg')
  })

  // Case 5: Both null/empty → null
  test('returns null when both inputs are null', ({ assert }) => {
    assert.isNull(normalizeDrugName(null, null))
  })

  test('returns null when both inputs are empty strings', ({ assert }) => {
    assert.isNull(normalizeDrugName('', ''))
  })

  // Case 6: Extra whitespace collapsed
  test('collapses extra whitespace', ({ assert }) => {
    assert.equal(normalizeDrugName('  Advil   PM ', 'ibuprofen'), 'advil pm ibuprofen')
  })

  // Edge: one null
  test('handles null brand with non-null generic', ({ assert }) => {
    assert.equal(normalizeDrugName(null, 'ibuprofen'), 'ibuprofen')
  })

  test('handles non-null brand with null generic', ({ assert }) => {
    assert.equal(normalizeDrugName('Advil', null), 'advil')
  })
})

// ─── parseDrugLabelManifest ───────────────────────────────────────────────────

test.group('parseDrugLabelManifest', () => {
  const wellFormed = {
    meta: { disclaimer: 'Do not rely...' },
    results: {
      drug: {
        label: {
          export_date: '2026-06-06',
          total_records: 258914,
          partitions: [
            {
              display_name: '/drug/label (part 1 of 13)',
              file: 'https://download.open.fda.gov/drug/label/drug-label-0001-of-0013.json.zip',
              size_mb: '128.11',
              records: 20000,
            },
            {
              display_name: '/drug/label (part 2 of 13)',
              file: 'https://download.open.fda.gov/drug/label/drug-label-0002-of-0013.json.zip',
              size_mb: '143.09',
              records: 20000,
            },
          ],
        },
      },
    },
  }

  // Well-formed → typed object
  test('parses a well-formed manifest into a typed object', ({ assert }) => {
    const result = parseDrugLabelManifest(wellFormed)
    assert.equal(result.export_date, '2026-06-06')
    assert.equal(result.total_records, 258914)
    assert.lengthOf(result.partitions, 2)
    assert.equal(
      result.partitions[0].file,
      'https://download.open.fda.gov/drug/label/drug-label-0001-of-0013.json.zip'
    )
    assert.equal(result.partitions[0].records, 20000)
    assert.equal(result.partitions[1].size_mb, '143.09')
  })

  // Missing results.drug.label → throws
  test('throws when results.drug.label is missing', ({ assert }) => {
    const bad = { results: { drug: {} } }
    assert.throws(() => parseDrugLabelManifest(bad), /Unexpected FDA manifest format/)
  })

  test('throws when results is missing entirely', ({ assert }) => {
    assert.throws(() => parseDrugLabelManifest({}), /Unexpected FDA manifest format/)
  })

  // Partition missing file → skipped
  test('skips partitions that are missing the file field', ({ assert }) => {
    const partial = {
      results: {
        drug: {
          label: {
            export_date: '2026-06-06',
            total_records: 100,
            partitions: [
              { display_name: 'bad', size_mb: '10', records: 5 }, // no file
              {
                display_name: 'good',
                file: 'https://example.com/part.zip',
                size_mb: '10',
                records: 5,
              },
            ],
          },
        },
      },
    }
    const result = parseDrugLabelManifest(partial)
    assert.lengthOf(result.partitions, 1)
    assert.equal(result.partitions[0].file, 'https://example.com/part.zip')
  })

  // All partitions invalid → throws
  test('throws when all partitions lack a file field', ({ assert }) => {
    const allBad = {
      results: {
        drug: {
          label: {
            export_date: '2026-06-06',
            total_records: 100,
            partitions: [{ display_name: 'bad', records: 5 }],
          },
        },
      },
    }
    assert.throws(() => parseDrugLabelManifest(allBad), /all partitions were invalid/)
  })
})
