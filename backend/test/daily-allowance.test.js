const { test } = require('node:test')
const assert = require('node:assert/strict')
const { dailyAllowance } = require('../dist/modules/planning/daily-allowance')
test('daily discretionary allowance is stable across a reserved bill payment', () => {
  assert.equal(dailyAllowance(30000, 0, 0, 6000, 0, 10), 2400)
  assert.equal(dailyAllowance(30000, 6000, 6000, 0, 6000, 10), 2400)
})
test('ordinary purchases reduce today and future-dated entries consume monthly room', () => {
  assert.equal(dailyAllowance(30000, 6100, 6100, 0, 6000, 10), 2300)
  assert.equal(dailyAllowance(30000, 1000, 0, 6000, 0, 10), 2300)
})
test('over-budget, oversized commitments and last-day cases never invent allowance', () => {
  assert.equal(dailyAllowance(1000, 1100, 0, 0, 0, 5), 0)
  assert.equal(dailyAllowance(1000, 0, 0, 1500, 0, 5), 0)
  assert.equal(dailyAllowance(1000, 100, 100, 400, 0, 1), 500)
})
