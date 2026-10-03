// Shared with bank-mail.cjs: real isolated DB/API/browser, synthetic accounts only.
const assert = require('node:assert/strict')
const path = require('node:path')

exports.api = async ({ account, db, clearThrottle, pass }) => {
  const user = await account('balance'), other = await account('balance-other')
  const brief = () => user.call('GET', '/analytics/daily-brief')
  assert.equal((await user.call('GET', '/auth/me')).showCumulativeBalance, false)
  assert.equal((await brief()).cumulativeBalance, null)

  // Verify the default on existing rows as well as newly registered accounts.
  // Roll back schema/data changes inside this disposable database only.
  const q = db.createQueryRunner(); await q.connect(); await q.startTransaction()
  try {
    const { HomeCumulativeBalance1785410000000 } = require('../dist/migrations/1785410000000-HomeCumulativeBalance')
    const migration = new HomeCumulativeBalance1785410000000()
    await migration.down(q); await migration.up(q)
    assert.equal((await q.query('SELECT count(*)::int AS count FROM users WHERE show_cumulative_balance IS DISTINCT FROM false'))[0].count, 0)
  } finally { await q.rollbackTransaction(); await q.release() }

  for (const invalid of [null, 'true', 1]) await user.call('PATCH', '/auth/preferences', { showCumulativeBalance: invalid }, 400)
  await user.call('PATCH', '/auth/preferences', { showCumulativeBalance: true, userId: other.user.id }, 400)
  await user.call('PATCH', '/auth/preferences', { showCumulativeBalance: true })
  assert.equal((await brief()).cumulativeBalance, 0)
  assert.equal((await other.call('GET', '/auth/me')).showCumulativeBalance, false)
  assert.equal((await other.call('GET', '/analytics/daily-brief')).cumulativeBalance, null)

  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
  const older = new Date(today + 'T12:00:00Z'); older.setUTCMonth(older.getUTCMonth() - 2, 1)
  const expenseCategory = user.settings.expenseCategoryId, incomeCategory = user.settings.incomeCategoryId
  const add = (amount, type, date) => user.call('POST', '/expenses', {
    amount, type, categoryId: type === 'income' ? incomeCategory : expenseCategory, occurredAt: date + 'T12:00:00+07:00',
  })
  const oldDate = older.toISOString().slice(0, 10)
  const income = await add(1000.50, 'income', oldDate)
  const expense = await add(125.25, 'expense', oldDate)
  const current = await add(30.25, 'expense', today)
  assert.equal((await brief()).cumulativeBalance, 845)
  assert.equal((await brief()).monthSpent, 30.25)
  await user.call('PATCH', `/expenses/${current.id}`, { amount: 45.25 })
  assert.equal((await brief()).cumulativeBalance, 830)
  await user.call('DELETE', `/expenses/${expense.id}`)
  assert.equal((await brief()).cumulativeBalance, 955.25)
  await user.call('DELETE', `/expenses/${income.id}`)
  assert.equal((await brief()).cumulativeBalance, -45.25)
  await user.call('DELETE', `/expenses/${current.id}`)
  assert.equal((await brief()).cumulativeBalance, 0)
  clearThrottle()
  await add(1000.50, 'income', oldDate); await add(155.50, 'expense', today)
  await user.call('PATCH', '/auth/preferences', { showCumulativeBalance: false, trackingMode: 'track_only' })
  assert.equal((await brief()).cumulativeBalance, null)
  await other.call('PATCH', '/auth/preferences', { showCumulativeBalance: true })
  await other.call('POST', '/account/factory-reset', { confirm: other.user.email, lang: 'th' })
  assert.equal((await other.call('GET', '/auth/me')).showCumulativeBalance, false)
  user.user = await user.call('GET', '/auth/me')
  user.today = today
  pass('cumulative balance defaults off, isolates users, tracks all-month edits/deletes, handles zero/negative and resets off')
  return user
}

exports.browser = async ({ browser, WEB, expect, user, clearThrottle, pass, output }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('flo_token', token); localStorage.setItem('flo_user', JSON.stringify(user))
    if (!localStorage.getItem('flo_lang')) localStorage.setItem('flo_lang', 'th')
    if (!localStorage.getItem('flo_theme')) localStorage.setItem('flo_theme', 'dark')
  }, user)
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  const group = page.getByRole('group', { name: 'คงเหลือสะสม', exact: true })
  const toggle = page.getByRole('switch', { name: 'แสดงยอดคงเหลือสะสมบนหน้าหลัก', exact: true })
  const go = async route => { clearThrottle(); await page.goto(WEB + route) }
  await go('/'); await expect(page.locator('.daily-hero')).toBeVisible(); await expect(group).toHaveCount(0)
  await go('/settings'); await expect(toggle).toBeEnabled(); await expect(toggle).not.toBeChecked()
  await page.route('**/api/auth/preferences', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"fixture unavailable"}' }), { times: 1 })
  await toggle.click()
  await expect(page.locator('#settings-appearance').getByRole('alert')).toBeVisible()
  await expect(toggle).not.toBeChecked(); await expect(toggle).toBeEnabled()
  await toggle.click(); await expect(toggle).toBeChecked()
  clearThrottle(); await page.reload(); await expect(toggle).toBeEnabled(); await expect(toggle).toBeChecked()
  await go('/'); await expect(group).toContainText('฿845.00')
  await expect(group).toContainText('รายรับ − รายจ่ายที่บันทึกไว้ทุกเดือน')
  assert.equal(await page.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth), true)
  await page.screenshot({ path: path.join(output, 'cumulative-track-mobile-dark.png') })

  clearThrottle(); await user.call('PATCH', '/auth/preferences', { trackingMode: 'plan', monthlySpendingLimit: 30000 })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => localStorage.setItem('flo_theme', 'light'))
  clearThrottle(); await page.reload(); await expect(group).toContainText('฿845.00')
  await expect(page.locator('.daily-hero').getByRole('progressbar')).toBeVisible()
  await page.screenshot({ path: path.join(output, 'cumulative-plan-desktop-light.png') })

  for (const [amount, expected] of [[845, '฿0.00'], [1.25, '฿-1.25']]) {
    clearThrottle(); await user.call('POST', '/expenses', { categoryId: user.settings.expenseCategoryId, amount, type: 'expense', occurredAt: user.today + 'T12:00:00+07:00' })
    await go('/'); await expect(group).toContainText(expected)
  }
  await go('/settings'); await expect(toggle).toBeEnabled(); await toggle.click(); await expect(toggle).not.toBeChecked()
  clearThrottle(); await page.reload(); await expect(toggle).toBeEnabled(); await expect(toggle).not.toBeChecked()
  await go('/'); await expect(page.locator('.daily-hero')).toBeVisible(); await expect(group).toHaveCount(0)
  assert.deepEqual(errors, [])
  await context.close()
  pass('Home balance switch persists, keeps its value on API failure and displays positive/zero/negative balances in both modes')
}
