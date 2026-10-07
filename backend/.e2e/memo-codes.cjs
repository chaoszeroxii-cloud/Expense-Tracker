// Synthetic mail only; run through bank-mail.cjs against its disposable database.
const assert = require('node:assert/strict')
const path = require('node:path')

exports.api = async ({ account, connect, db, clearThrottle, pass, mailboxes, billMessage, API }) => {
  const user = await account('codes'), other = await account('codes-other')
  assert.ok((await user.call('GET', '/categories')).every(c => c.memoCode === null))
  const q = db.createQueryRunner(); await q.connect(); await q.startTransaction()
  try {
    const { CategoryMemoCodes1785420000000 } = require('../dist/migrations/1785420000000-CategoryMemoCodes')
    const migration = new CategoryMemoCodes1785420000000()
    await migration.down(q); await migration.up(q)
    assert.equal((await q.query('SELECT count(*)::int AS count FROM categories WHERE memo_code IS NOT NULL'))[0].count, 0)
  } finally { await q.rollbackTransaction(); await q.release() }

  const create = (name, type, memoCode) => user.call('POST', '/categories', { name, type, memoCode, icon: 'food', color: '#10b981' })
  const food = await create('อาหารรหัส', 'expense', ' #กิน ')
  const travel = await create('เดินทางรหัส', 'expense', 'GO')
  const income = await create('เงินเดือนรหัส', 'income', 'PAY')
  assert.equal(food.memoCode, 'กิน'); assert.equal(travel.memoCode, 'go')
  for (const bad of [1, true, [], {}, 'a b', 'a'.repeat(21), '-first', '#<img>', 'go/now']) {
    await user.call('PATCH', `/categories/${food.id}`, { memoCode: bad }, 400)
  }
  await user.call('PATCH', `/categories/${food.id}`, { memoCode: 'GO' }, 409)
  await user.call('POST', '/categories', { name: 'Duplicate income', type: 'income', memoCode: '#GO' }, 409)
  await other.call('PATCH', `/categories/${food.id}`, { memoCode: 'steal' }, 404)
  await user.call('PATCH', `/categories/${food.id}`, { memoCode: 'new', userId: other.user.id }, 400)
  const otherFood = await other.call('POST', '/categories', { name: 'Other user food', type: 'expense', memoCode: 'กิน' })
  assert.notEqual(otherFood.id, food.id)
  const concurrent = await Promise.all(['Race one', 'Race two'].map(name => fetch(API + '/categories', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({ name, type: 'expense', memoCode: '#RACE' }),
  }).then(async response => ({ status: response.status, data: await response.json() }))))
  assert.deepEqual(concurrent.map(r => r.status).sort(), [201, 409])
  assert.equal(concurrent.find(r => r.status === 409).data.message, 'memo_code_taken')
  await user.call('PATCH', `/categories/${travel.id}`, { memoCode: '' })
  assert.equal((await user.call('GET', '/categories')).find(c => c.id === travel.id).memoCode, null)
  await user.call('PATCH', `/categories/${travel.id}`, { memoCode: '#GO' })
  pass('category codes migrate empty, validate raw input, normalize, enforce concurrent uniqueness and isolate users')

  await connect(user, 'codes'); await connect(other, 'codes-other')
  await user.call('PUT', '/bank-mail/settings', user.settings)
  await other.call('PUT', '/bank-mail/settings', other.settings)
  await db.query("UPDATE bank_mail_connections SET auto_import_since=now()-interval '10 seconds' WHERE user_id = ANY($1)", [[user.user.id, other.user.id]])
  const wallet = await user.call('POST', '/allocations', { name: 'Food test wallet', categoryIds: [food.id] })
  const first = billMessage('code1', 41, { memo: 'ข้าวกลางวัน #กิน' })
  const noCode = billMessage('code2', 42, { memo: 'อาหารธรรมดา' })
  mailboxes.set('codes', [first, noCode]); mailboxes.set('codes-other', [first])
  clearThrottle(); await user.call('POST', '/bank-mail/sync'); await other.call('POST', '/bank-mail/sync')
  const saved = (await user.call('GET', '/bank-mail/entries?status=saved')).rows
  assert.equal(saved.length, 2)
  const codedExpense = await user.call('GET', `/expenses/${saved.find(row => row.transaction.amount === 41).expenseId}`)
  assert.equal(codedExpense.categoryId, food.id); assert.equal(codedExpense.allocationId, wallet.id)
  assert.equal(codedExpense.note, 'ข้าวกลางวัน #กิน\nKTB • 1111 • Gmail')
  assert.equal(Number((await db.query('SELECT balance FROM allocations WHERE id=$1', [wallet.id]))[0].balance), -41)
  const plainExpense = await user.call('GET', `/expenses/${saved.find(row => row.transaction.amount === 42).expenseId}`)
  assert.equal(plainExpense.categoryId, user.settings.expenseCategoryId)
  const otherSaved = (await other.call('GET', '/bank-mail/entries?status=saved')).rows[0]
  assert.equal((await other.call('GET', `/expenses/${otherSaved.expenseId}`)).categoryId, otherFood.id)
  await user.call('POST', '/bank-mail/sync')
  assert.equal((await user.call('GET', '/bank-mail/entries?status=saved')).total, 2)
  pass('memo codes override defaults, preserve notes, debit linked wallets and deduplicate independently per user')

  mailboxes.set('codes', [
    billMessage('code3', 43, { memo: '#missing' }),
    billMessage('code4', 44, { memo: '#กิน #go' }),
    billMessage('code5', 45, { memo: '#pay' }),
    billMessage('code6', 46, { memo: '#กิน', fee: '2.00' }),
    billMessage('code7', 47, { memo: '#กิน', wallet: true, goods: true }),
  ])
  await user.call('POST', '/bank-mail/sync')
  let pending = (await user.call('GET', '/bank-mail/entries')).rows
  assert.equal(pending.length, 5)
  for (const [amount, reason] of [[43, 'memo_code_unknown'], [44, 'memo_code_multiple'], [45, 'memo_code_type_mismatch'], [46, 'fee_review'], [47, 'possible_transfer']]) {
    const row = pending.find(r => r.transaction.amount === amount)
    assert.equal(row.reason, reason)
    assert.equal(row.categoryHint.categoryId, amount >= 46 ? food.id : null)
  }
  assert.equal((await user.call('GET', '/bank-mail/entries?status=saved')).total, 2)
  const fee = pending.find(r => r.transaction.amount === 46)
  const reviewed = await user.call('POST', `/bank-mail/entries/${fee.id}/save`, { categoryId: travel.id, type: 'expense' })
  assert.equal((await user.call('GET', `/expenses/${reviewed.expenseId}`)).categoryId, travel.id)
  assert.equal(Number((await db.query('SELECT balance FROM allocations WHERE id=$1', [wallet.id]))[0].balance), -41)
  pass('unknown/multiple/wrong-type codes stay in review; codes cannot bypass fees or own transfers; manual choices win')

  const later = await create('ตั้งรหัสทีหลัง', 'expense', 'missing')
  pending = (await user.call('GET', '/bank-mail/entries')).rows
  const formerlyUnknown = pending.find(r => r.transaction.amount === 43)
  assert.equal(formerlyUnknown.categoryHint.categoryId, later.id)
  assert.equal(formerlyUnknown.reason, 'review_required')
  await user.call('DELETE', `/categories/${later.id}`)
  assert.equal((await user.call('GET', '/bank-mail/entries')).rows.find(r => r.id === formerlyUnknown.id).categoryHint.issue, 'memo_code_unknown')
  await user.call('PATCH', `/categories/${food.id}`, { memoCode: 'meal' })
  assert.equal((await user.call('GET', '/bank-mail/entries')).rows.find(r => r.transaction.amount === 47).categoryHint.issue, 'memo_code_unknown')
  assert.equal((await user.call('GET', `/expenses/${codedExpense.id}`)).categoryId, food.id)
  await user.call('PATCH', `/categories/${food.id}`, { memoCode: 'กิน' })
  // A normal review item for the browser; editing code settings never auto-saves it.
  await user.call('PUT', '/bank-mail/settings', { ...user.settings, autoImport: false })
  mailboxes.set('codes', [billMessage('code8', 58, { memo: 'ไปทำงาน #GO' })])
  await user.call('POST', '/bank-mail/sync')
  assert.equal((await user.call('GET', '/bank-mail/entries')).rows.find(r => r.transaction.amount === 58).categoryHint.categoryId, travel.id)
  pass('pending hints follow added, renamed and deleted codes without reclassifying or reimporting saved expenses')
  return { user, food, travel, income }
}

exports.browser = async ({ browser, WEB, expect, fixture, clearThrottle, pass, output }) => {
  const { user, food, travel } = fixture
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('flo_token', token); localStorage.setItem('flo_user', JSON.stringify(user))
      if (!localStorage.getItem('flo_lang')) localStorage.setItem('flo_lang', 'th')
      if (!localStorage.getItem('flo_theme')) localStorage.setItem('flo_theme', 'dark')
    }, user)
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    clearThrottle(); await page.goto(WEB + '/settings')
    const categories = page.locator('#settings-categories'), mail = page.locator('#settings-bank-mail')
    await mail.getByRole('button', { name: 'ตั้งรหัสหมวดหมู่', exact: true }).click()
    const edit = () => categories.getByRole('button', { name: `แก้ไขหมวดหมู่ ${food.name}`, exact: true }).click()
    await edit()
    const code = categories.getByLabel('รหัสหมวดในบันทึกช่วยจำ (ไม่บังคับ)', { exact: true })
    const save = categories.getByRole('button', { name: 'บันทึก', exact: true })
    await expect(code).toHaveValue('กิน')
    await code.fill('go'); await save.click()
    await expect(categories.getByRole('alert')).toContainText('รหัสนี้ใช้กับหมวดอื่นแล้ว')
    await code.fill('bad code'); await save.click()
    await expect(categories.getByRole('alert')).toContainText('ห้ามเว้นวรรค')
    await code.fill('#1')
    const route = `**/api/categories/${food.id}`
    await page.route(route, r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"test failure"}' }))
    await save.click(); await expect(categories.getByRole('alert')).toBeVisible(); await expect(code).toHaveValue('#1')
    await page.unroute(route)
    clearThrottle(); await save.click(); await expect(code).toHaveCount(0)
    await expect(categories.getByText('#1', { exact: true })).toBeVisible()
    await page.reload(); await edit(); await expect(code).toHaveValue('1')
    await code.fill('#กิน'); await save.click(); await expect(code).toHaveCount(0)

    const review = mail.locator('article').filter({ hasText: 'ไปทำงาน #GO' })
    await expect(review.getByLabel('เลือกหมวด', { exact: true })).toHaveValue(travel.id)
    await expect(review).toContainText('เลือกหมวดจากบันทึกช่วยจำ: #go → เดินทางรหัส')
    // A changed code removes the pending hint immediately after the category save.
    await categories.getByRole('button', { name: `แก้ไขหมวดหมู่ ${travel.name}`, exact: true }).click()
    await code.fill('ride'); await save.click(); await expect(code).toHaveCount(0)
    await expect(review.getByLabel('เลือกหมวด', { exact: true })).toHaveValue('')
    await expect(review).toContainText('ยังไม่ได้ตั้งรหัสนี้')
    await categories.getByRole('button', { name: `แก้ไขหมวดหมู่ ${travel.name}`, exact: true }).click()
    await code.fill('go'); await save.click(); await expect(code).toHaveCount(0)
    await expect(review.getByLabel('เลือกหมวด', { exact: true })).toHaveValue(travel.id)
    for (const [theme, width] of [['dark', 390], ['light', 1440]]) {
      await page.evaluate(theme => localStorage.setItem('flo_theme', theme), theme)
      await page.setViewportSize({ width, height: 1000 }); clearThrottle(); await page.reload()
      await edit(); await code.scrollIntoViewIfNeeded()
      assert.equal(await page.locator('#main-content').evaluate(el => el.scrollWidth <= el.clientWidth), true)
      await page.screenshot({ path: path.join(output, `memo-code-${theme}-${width}.png`) })
      await categories.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
      await review.scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(output, `memo-review-${theme}-${width}.png`) })
    }
    await review.getByLabel('เลือกหมวด', { exact: true }).selectOption(food.id)
    clearThrottle()
    const recorded = page.waitForResponse(response => response.url().endsWith('/save') && response.request().method() === 'POST')
    await review.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click()
    const response = await recorded
    assert.equal(response.status(), 200, await response.text())
    await expect(review).toHaveCount(0)
    const entry = (await user.call('GET', '/bank-mail/entries?status=saved')).rows.find(r => r.transaction.amount === 58)
    assert.equal((await user.call('GET', `/expenses/${entry.expenseId}`)).categoryId, food.id)
    assert.deepEqual(errors, [])
    pass('browser code editing validates, retries, persists, refreshes hints and records an explicit override on mobile/desktop')
  } finally { await context.close() }
}
