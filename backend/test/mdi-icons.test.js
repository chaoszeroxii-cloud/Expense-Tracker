const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MDI_ICON_IDS,
  normalizeMdiIconId,
  resolveMdiIconId,
} = require('../dist/common/icon.util')
const catalog = require('@mdi/js')

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

test('every installed MDI export is supported without expanding a manual allow-list', () => {
  const names = Object.keys(catalog).filter(name => /^mdi[A-Z0-9]/.test(name))
  assert.ok(names.length > 7000)
  for (const name of names) {
    assert.ok(name.length <= 50, `${name} exceeds the stored column`)
    assert.equal(resolveMdiIconId(name), name)
  }
})

test('website names, CSS names, bare names and JavaScript exports resolve consistently', () => {
  for (const name of ['mdi:train', 'mdi-train', 'train', 'mdiTrain', ' mdi:train ']) {
    assert.equal(resolveMdiIconId(name), 'mdiTrain')
  }
  assert.equal(resolveMdiIconId('mdi:account-cash-outline'), 'mdiAccountCashOutline')
  assert.equal(resolveMdiIconId('mdi:numeric-0-box'), 'mdiNumeric0Box')
})

test('unknown names, prototype keys and executable markup cannot become custom icons', () => {
  for (const name of ['__proto__', 'constructor', 'toString', 'prototype', 'mdi:unknown-icon-abcxyz',
    '<svg onload=alert(1)>', 'https://example.test/icon.svg', 'javascript:alert(1)', '../train',
    'M12,0L0,12', 'mdi:train onload=alert(1)', 'mdi' + 'A'.repeat(50), 1, {}, []]) {
    assert.equal(resolveMdiIconId(name), null)
    assert.equal(normalizeMdiIconId(name, 'other'), 'other')
  }
})
