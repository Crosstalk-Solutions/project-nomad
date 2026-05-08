import { test } from '@japa/runner'
import { normalizeMapMarker } from '../../inertia/hooks/useMapMarkers.js'

test.group('normalizeMapMarker', () => {
  test('preserves marker notes from the API payload', ({ assert }) => {
    const marker = normalizeMapMarker({
      id: 7,
      name: 'Library',
      longitude: -1.23,
      latitude: 4.56,
      color: 'orange',
      notes: 'Bring offline atlas',
      created_at: '2026-05-08T00:00:00.000Z',
    })

    assert.equal(marker.notes, 'Bring offline atlas')
    assert.equal(marker.name, 'Library')
  })

  test('normalizes missing notes to null', ({ assert }) => {
    const marker = normalizeMapMarker({
      id: 8,
      name: 'Clinic',
      longitude: 1.23,
      latitude: -4.56,
      color: 'blue',
      created_at: '2026-05-08T00:00:00.000Z',
    })

    assert.isNull(marker.notes)
  })
})
