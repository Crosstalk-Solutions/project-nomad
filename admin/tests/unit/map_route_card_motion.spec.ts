import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  routeCardDropInside,
  routeCardInsertionIndex,
  routeCardScrollSpeed,
} from '../../app/utils/map_route_card_motion.js'

test('drag insertion crosses stable midpoint thresholds with hysteresis', () => {
  const centers = [75, 233, 391]
  assert.equal(routeCardInsertionIndex(233, 1, centers), 1)
  assert.equal(routeCardInsertionIndex(238, 1, centers), 1)
  assert.equal(routeCardInsertionIndex(240, 1, centers), 2)
  assert.equal(routeCardInsertionIndex(230, 2, centers), 2)
  assert.equal(routeCardInsertionIndex(226, 2, centers), 1)
})

test('a quick drag can cross several differently sized cards in either direction', () => {
  assert.equal(routeCardInsertionIndex(700, 0, [65, 290, 550]), 3)
  assert.equal(routeCardInsertionIndex(-10, 3, [65, 290, 550]), 0)
  assert.equal(routeCardInsertionIndex(NaN, 2, [65, 290, 550]), 2)
})

test('a tall expanded card grabbed at its top can move above a short first card', () => {
  const cardHeight = 350
  const grabOffset = 15
  const pointerY = 50
  const originalFirstCardMidpoint = 75
  // Its center would still be below the first card, even with the pointer
  // inside the valid drop area. Insertion must follow the handle instead.
  assert.ok(pointerY - grabOffset + cardHeight / 2 > originalFirstCardMidpoint)
  assert.equal(routeCardInsertionIndex(pointerY, 1, [originalFirstCardMidpoint, 540]), 0)
})

test('drop requires a visible point inside both the list and its scrolled viewport', () => {
  const list = { left: 200, right: 540, top: -100, bottom: 800 }
  const viewport = { top: 120, bottom: 650 }
  assert.equal(routeCardDropInside(350, 300, list, viewport), true)
  assert.equal(routeCardDropInside(199, 300, list, viewport), false)
  assert.equal(routeCardDropInside(541, 300, list, viewport), false)
  assert.equal(routeCardDropInside(350, 119, list, viewport), false)
  assert.equal(routeCardDropInside(350, 651, list, viewport), false)
  assert.equal(routeCardDropInside(NaN, 300, list, viewport), false)
  assert.equal(routeCardDropInside(350, 400, { ...list, bottom: 350 }, viewport), false)
})

test('edge scrolling is bounded, directional and still in the center or outside', () => {
  assert.equal(routeCardScrollSpeed(100, 100, 700), -420)
  assert.equal(routeCardScrollSpeed(700, 100, 700), 420)
  assert.equal(routeCardScrollSpeed(124, 100, 700), -210)
  assert.equal(routeCardScrollSpeed(676, 100, 700), 210)
  assert.equal(routeCardScrollSpeed(400, 100, 700), 0)
  assert.equal(routeCardScrollSpeed(99, 100, 700), 0)
  assert.equal(routeCardScrollSpeed(701, 100, 700), 0)
  assert.equal(routeCardScrollSpeed(100, 100, 100), 0)
})
