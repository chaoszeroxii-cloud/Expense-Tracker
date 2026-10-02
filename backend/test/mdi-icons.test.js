const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MDI_ICON_IDS,
  normalizeMdiIconId,
} = require('../dist/common/icon.util')

test('supported MDI icon IDs remain unchanged', () => {
  for (const iconId of MDI_ICON_IDS) {
    assert.equal(normalizeMdiIconId(iconId, 'other'), iconId)
  }
})

test('legacy emoji are converted before persistence', () => {
  assert.equal(normalizeMdiIconId('🍜', 'other'), 'food')
  assert.equal(normalizeMdiIconId('🏦', 'wallet'), 'bank')
  assert.equal(normalizeMdiIconId('📈', 'other'), 'investment')
})

test('missing and unsupported icons use an MDI fallback', () => {
  assert.equal(normalizeMdiIconId(undefined, 'other'), 'other')
  assert.equal(normalizeMdiIconId('not-an-icon', 'wallet'), 'wallet')
})
