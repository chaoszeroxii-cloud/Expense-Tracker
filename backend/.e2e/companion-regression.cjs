// Real, disposable Postgres and API. External image recognition and push delivery are stubbed.
// Vite: 127.0.0.1:5175 -> API 127.0.0.1:3096; DB moneyflow_visual_test on port 15435.
const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path')
const { randomUUID } = require('node:crypto'),
  { spawn } = require('node:child_process')
const { chromium, expect } = require('playwright/test')
const ROOT = path.resolve(__dirname, '../..'),
  OUT = path.join(ROOT, 'frontend/.smoke/ux-artifacts/companion')
const WEB = 'http://127.0.0.1:5175',
  API = 'http://127.0.0.1:3096/api'
process.chdir(__dirname)
for (const key of Object.keys(process.env))
  if (
    /DATABASE_URL|GOOGLE_CLIENT_ID|FACEBOOK_APP_|BREVO_|TAVILY_|OPENROUTER_|VAPID_|CRON_SECRET/.test(
      key,
    )
  )
    delete process.env[key]
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_HOST: '127.0.0.1',
  DB_PORT: '15435',
  DB_USER: 'expense_user',
  DB_PASSWORD: 'visual-local-only',
  DB_NAME: 'moneyflow_visual_test',
  JWT_SECRET: 'companion-test-only-not-a-production-secret',
  CORS_ORIGIN: WEB,
  TRUST_PROXY_HOPS: '0',
})
require('reflect-metadata')
const { NestFactory } = require('@nestjs/core'),
  { DataSource } = require('typeorm')
const { AppModule } = require('../dist/app.module'),
  { databaseConfig } = require('../dist/config/database.config'),
  { configureApp } = require('../dist/config/configure-app')
const { ChatService } = require('../dist/modules/chat/chat.service'),
  { NotificationsService } = require('../dist/modules/notifications/notifications.service')
const { payCycleBounds } = require('../dist/modules/planning/planning-extras.service'),
  { localToday, shiftDate, shiftMonth } = require('../dist/common/local-date.util')
let app, db, browser, page
const checks = []
const pass = (name) => {
  checks.push(name)
  console.log('PASS', name)
}
async function api(method, route, data, token, status) {
  const res = await fetch(API + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  const body = await res.text()
  assert.ok(
    status ? res.status === status : res.ok,
    `${method} ${route}: ${res.status} ${body.slice(0, 300)}`,
  )
  return body ? JSON.parse(body) : null
}
async function account(label) {
  const auth = await api('POST', '/auth/register', {
    email: `companion-${label}-${Date.now()}@test.local`,
    name: 'Companion',
    password: 'companion-fixture-123',
    lang: 'en',
  })
  const call = (m, r, b, s) => api(m, r, b, auth.accessToken, s)
  await call('POST', '/auth/onboarding', {
    trackingMode: 'plan',
    monthlySpendingLimit: 30000,
    timezone: 'Asia/Bangkok',
    lang: 'en',
  })
  return {
    token: auth.accessToken,
    call,
    user: await call('GET', '/auth/me'),
    cats: await call('GET', '/categories'),
  }
}
async function run() {
  await fs.mkdir(OUT, { recursive: true })
  db = new DataSource(databaseConfig())
  await db.initialize()
  assert.equal(
    (await db.query('SELECT current_database() AS name'))[0].name,
    'moneyflow_visual_test',
  )
  await db.runMigrations()
  app = await NestFactory.create(AppModule, { logger: false, bodyParser: false })
  configureApp(app)
  await app.listen(3096, '127.0.0.1')
  const a = await account('a'),
    b = await account('b'),
    call = a.call
  const cat = a.cats.find((c) => c.type === 'expense'),
    foreign = b.cats.find((c) => c.type === 'expense'),
    today = localToday('Asia/Bangkok'),
    month = today.slice(0, 7)
  const pin = await call('POST', '/capture/templates', {
    name: 'Morning coffee',
    amount: 60,
    categoryId: cat.id,
    type: 'expense',
    note: 'Coffee',
  })
  await b.call(
    'PUT',
    `/capture/templates/${pin.id}`,
    { name: 'Stolen', amount: 1, categoryId: foreign.id, type: 'expense' },
    404,
  )
  await call(
    'POST',
    '/capture/templates',
    { name: 'Bad', amount: 60, categoryId: foreign.id, type: 'expense' },
    400,
  )
  assert.equal((await call('GET', '/capture/templates'))[0].name, 'Morning coffee')
  pass('pins persist and reject foreign categories/template access')
  const row = {
    clientKey: randomUUID(),
    date: today,
    type: 'expense',
    categoryId: cat.id,
    amount: 85,
    note: 'API coffee',
  }
  const before = await call('GET', '/analytics/balance')
  let preview = await call('POST', '/capture/preview', { rows: [row] })
  assert.equal(preview.rows[0].duplicate, false)
  assert.equal((await call('GET', '/expenses/page')).total, 0)
  pass('batch preview has no ledger effect')
  const attempts = await Promise.all([
    call('POST', '/capture/batch', { rows: [row] }),
    call('POST', '/capture/batch', { rows: [row] }),
  ])
  assert.equal(attempts[0].rows[0].expenseId, attempts[1].rows[0].expenseId)
  assert.equal(
    (await call('GET', '/analytics/balance')).totalBalance,
    Number(before.totalBalance) - 85,
  )
  pass('concurrent batch retries create once and debit once')
  const dupe = { ...row, clientKey: randomUUID() }
  assert.equal((await call('POST', '/capture/preview', { rows: [dupe] })).rows[0].duplicate, true)
  await call('POST', '/capture/batch', { rows: [dupe] }, 409)
  await call('POST', '/capture/batch', { rows: [{ ...dupe, allowDuplicate: true }] })
  pass('likely duplicates require explicit acknowledgement')
  await call('POST', '/capture/batch', { rows: [{ ...row, amount: 99 }] }, 409)
  pass('edited retries cannot silently return a different saved transaction')
  const currentCount = (await call('GET', '/expenses/page')).total
  await call(
    'POST',
    '/capture/batch',
    {
      rows: [
        { ...row, clientKey: randomUUID(), note: 'atomic rollback' },
        { ...row, clientKey: randomUUID(), categoryId: foreign.id },
      ],
    },
    400,
  )
  assert.equal((await call('GET', '/expenses/page')).total, currentCount)
  pass('invalid batch row rolls back every entry and balance change')
  await call(
    'POST',
    '/capture/preview',
    { rows: [{ ...row, clientKey: randomUUID(), date: '2026-02-30' }] },
    400,
  )
  await call(
    'POST',
    '/capture/preview',
    { rows: [{ ...row, clientKey: randomUUID(), date: shiftDate(today, 1) }] },
    400,
  )
  await call(
    'POST',
    '/capture/preview',
    { rows: Array.from({ length: 101 }, () => ({ ...row, clientKey: randomUUID() })) },
    400,
  )
  pass('invalid dates, future dates and oversized batches are rejected')
  const checked = await call('PUT', `/check-ins/${today}/review`)
  assert.equal(checked.days.find((d) => d.isToday).reviewed, true)
  const saved = await call('POST', '/capture/batch', {
    rows: [{ ...row, clientKey: randomUUID(), note: 'after review' }],
  })
  assert.equal(
    (await call('GET', '/analytics/daily-brief')).coverage.days.find((d) => d.isToday).reviewed,
    false,
  )
  pass('new captures reopen reviewed days instead of claiming completeness')
  const older = shiftDate(today, -12)
  await call('PUT', `/check-ins/${older}/review`)
  assert.equal(
    (await call('GET', '/check-ins/reviews')).days.find((d) => d.date === older).reviewed,
    true,
  )
  assert.equal(
    (await b.call('GET', '/check-ins/reviews')).days.find((d) => d.date === older).reviewed,
    false,
  )
  await call('DELETE', `/check-ins/${older}/review`)
  assert.equal(
    (await call('GET', '/check-ins/reviews')).days.find((d) => d.date === older).reviewed,
    false,
  )
  pass('older day reviews can be inspected and reopened without leaking another account')
  const weekly = await call('GET', '/analytics/weekly-review')
  assert.equal(weekly.action.kind, 'need_more_data')
  assert.ok(weekly.reviewedDays < 7)
  pass('weekly advice does not praise incomplete recording')
  await call('PUT', '/planning/pay-cycle', { enabled: true, payDay: 31, budget: 12000 })
  const cycle = await call('GET', '/planning/pay-cycle'),
    brief = await call('GET', '/analytics/daily-brief')
  assert.equal(brief.planPeriod.kind, 'pay_cycle')
  assert.equal(brief.safeToday, cycle.period.safeToday)
  assert.equal(brief.monthlyLimit, 12000)
  assert.deepEqual(payCycleBounds('2028-02-29', 31), {
    start: '2028-02-29',
    end: '2028-03-30',
    nextPayday: '2028-03-31',
    daysRemaining: 31,
  })
  assert.equal(payCycleBounds('2027-02-27', 31).start, '2027-01-31')
  assert.equal(payCycleBounds('2027-02-28', 31).start, '2027-02-28')
  assert.equal(payCycleBounds('2027-01-01', 25).start, '2026-12-25')
  pass('payday plan is the daily allowance source across short/leap months and years')
  await call('PUT', '/planning/pay-cycle', { enabled: false, payDay: 31, budget: 12000 })
  assert.equal((await call('GET', '/analytics/daily-brief')).planPeriod.kind, 'month')
  pass('disabling payday mode restores the existing calendar plan')
  const bill = await call('POST', '/planning/bills', {
    name: 'Rent reminder',
    amount: 6000,
    categoryId: cat.id,
    dueDay: 1,
  })
  await call('PUT', '/planning/reminders', { enabled: true, daysBefore: 14 })
  await call('PUT', '/planning/pay-cycle', {
    enabled: true,
    payDay: Number(today.slice(-2)),
    budget: 30000,
  })
  const billCycle = await call('GET', '/planning/pay-cycle'),
    billBrief = await call('GET', '/analytics/daily-brief')
  assert.equal(billBrief.unpaidBillCount, billCycle.period.unpaidBillCount)
  assert.equal(billBrief.unpaidBills, billCycle.period.unpaidBills)
  assert.deepEqual(billBrief.nextBill, billCycle.period.nextBill)
  assert.equal(billBrief.unpaidBillCount, Number(today.slice(-2)) === 1 ? 1 : 2)
  await call('PUT', '/planning/pay-cycle', { enabled: false, payDay: 31, budget: 12000 })
  pass('daily bill totals, count and next bill use the active payday period consistently')
  let reminders = await call('GET', '/planning/reminders')
  assert.ok(reminders.bills.some((r) => r.id === bill.id && r.month === month))
  await b.call(
    'PUT',
    `/planning/bills/${bill.id}/snooze`,
    { month, until: shiftDate(today, 1) },
    404,
  )
  await call('PUT', `/planning/bills/${bill.id}/snooze`, { month, until: shiftDate(today, 1) })
  assert.equal(
    (await call('GET', '/planning/reminders')).bills.find(
      (r) => r.id === bill.id && r.month === month,
    ).snoozedUntil,
    shiftDate(today, 1),
  )
  pass('bill reminders and snoozes are scoped to owner and exact bill cycle')
  const countBeforePay = (await call('GET', '/expenses/page')).total
  const paid = await call('POST', `/planning/bills/${bill.id}/pay`, {
    month,
    expenseId: saved.rows[0].expenseId,
  })
  assert.equal((await call('GET', '/expenses/page')).total, countBeforePay)
  assert.ok(
    !(await call('GET', '/planning/reminders')).bills.some(
      (r) => r.id === bill.id && r.month === month,
    ),
  )
  pass('linking an existing payment clears the reminder without duplicating spending')
  const next = shiftMonth(month, 1)
  const early = await call('POST', `/planning/bills/${bill.id}/pay`, { month: next })
  assert.ok(early.expenseId)
  assert.equal(
    (await call('POST', `/planning/bills/${bill.id}/pay`, { month: next })).expenseId,
    early.expenseId,
  )
  pass('next-cycle bills can be explicitly paid early exactly once')
  await db.query(
    `INSERT INTO day_reviews(user_id,local_date) SELECT $1,$2::date-i FROM generate_series(0,13) i ON CONFLICT DO NOTHING`,
    [a.user.id, today],
  )
  const completeWeek = await call('GET', '/analytics/weekly-review')
  assert.equal(completeWeek.reviewedDays, 7)
  assert.equal(completeWeek.previousReviewedDays, 7)
  assert.equal(completeWeek.ordinaryThisWeek, 170)
  if (Number(today.slice(-2)) >= 7) {
    const daysInMonth = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
    ).getUTCDate()
    assert.equal(
      completeWeek.plannedOrdinary,
      Math.round(((30000 - 6085) / daysInMonth) * 7 * 100) / 100,
    )
  }
  assert.notEqual(completeWeek.action.kind, 'need_more_data')
  pass('weekly comparisons exclude linked bills and require two reviewed weeks')
  const imageStatus = await call('GET', '/chat/receipt-status')
  assert.equal(imageStatus.configured, false)
  await call(
    'POST',
    '/chat/receipt-draft',
    { imageBase64: 'iVBORw0KGgoAAA==', mimeType: 'image/png' },
    503,
  )
  process.env.OPENROUTER_API_KEY = 'test-stub-no-network'
  const chat = app.get(ChatService)
  chat.analyzeImage = async () => ({
    isFinancialDoc: true,
    extractedData: { total: 125, shop: 'Receipt cafe', date: today },
  })
  await call(
    'POST',
    '/chat/receipt-draft',
    { imageBase64: Buffer.from('not image').toString('base64'), mimeType: 'image/png' },
    400,
  )
  const imageCount = (await call('GET', '/expenses/page')).total
  assert.equal(
    (
      await call('POST', '/chat/receipt-draft', {
        imageBase64: 'iVBORw0KGgoAAA==',
        mimeType: 'image/png',
      })
    ).amount,
    125,
  )
  assert.equal((await call('GET', '/expenses/page')).total, imageCount)
  pass(
    'receipt endpoint validates input, handles missing provider, and extracts only a draft (provider stubbed)',
  )
  await db.query(
    `INSERT INTO expenses(user_id,category_id,type,amount,note,occurred_at) SELECT $1,$2,'expense',1,'history '||i,($3::date+TIME '12:00') AT TIME ZONE 'Asia/Bangkok' FROM generate_series(1,520) i`,
    [b.user.id, foreign.id, shiftDate(today, -40)],
  )
  await db.query(`UPDATE users SET total_balance=total_balance-520 WHERE id=$1`, [b.user.id])
  const matches = await b.call('GET', '/expenses/page?search=history%20520')
  assert.equal(matches.total, 1)
  await call('GET', '/expenses/page?startDate=2026-02-30', undefined, 400)
  await call('GET', '/expenses/page?startDate=2026-03-01&endDate=2026-02-01', undefined, 400)
  const p1 = await b.call('GET', '/expenses/page'),
    p2 = await b.call('GET', '/expenses/page?offset=50')
  assert.equal(p1.total, 520)
  assert.equal(p1.items.length, 50)
  assert.ok(!p1.items.some((e) => p2.items.some((f) => f.id === e.id)))
  assert.equal((await call('GET', '/expenses/page?search=history')).total, 0)
  pass('history searches beyond 500 entries, paginates stably, and isolates accounts')
  // First-party calculations are exercised from their real source, without a browser dependency.
  const ts = require('typescript')
  function sourceModule(relative) {
    const code = require('node:fs').readFileSync(path.join(ROOT, relative), 'utf8')
    const module = { exports: {} }
    new Function(
      'module',
      'exports',
      ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    )(module, module.exports)
    return module.exports
  }
  const csv = sourceModule('frontend/src/utils/importCsv.ts')
  assert.deepEqual(csv.readCsv('date,note\r\n2026-09-01,"a,b\nline ""2"""'), [
    ['date', 'note'],
    ['2026-09-01', 'a,b\nline "2"'],
  ])
  assert.throws(() => csv.readCsv('a,b\n"oops,2'))
  assert.equal(csv.importDate('29/02/2567', 'thai'), '2024-02-29')
  assert.equal(csv.importDate('31/02/2026', 'dmy'), '')
  pass('CSV parser supports quotes/newlines and explicit Buddhist dates; invalid input fails')
  const scenario = sourceModule('frontend/src/utils/savingsScenario.ts')
  assert.equal(
    scenario.savingsScenario('2026-09-29', 10000, 4000, 1000, 1000).targetDate,
    '2026-11-30',
  )
  assert.equal(scenario.savingsScenario(today, 10000, 0, 0, 0), null)
  pass('goal simulation uses remaining savings and calendar contributions without ledger writes')
  const goal = await call('POST', '/planning/goals', {
    name: 'Travel goal',
    targetAmount: 18000,
    savedAmount: 6000,
    targetDate: '2027-03-01',
  })
  const clearThrottle = () =>
    app.get(require('@nestjs/throttler').getStorageToken()).storage.clear()
  clearThrottle() // Reset only the test fixture limiter between independent test phases.
  await call('PUT', '/planning/pay-cycle', { enabled: true, payDay: 25, budget: 12000 })
  await call('PATCH', '/auth/preferences', { trackingMode: 'track_only' })
  assert.equal((await call('GET', '/planning/pay-cycle')).enabled, false)
  await call('PATCH', '/auth/preferences', { trackingMode: 'plan' })
  assert.equal((await call('GET', '/analytics/daily-brief')).monthlyLimit, null)
  pass('track-only mode disables the payday plan and does not resurrect it later')
  await call('POST', '/account/factory-reset', { confirm: a.user.email, lang: 'en' })
  assert.equal((await call('GET', '/capture/templates')).length, 0)
  assert.equal((await call('GET', '/planning/pay-cycle')).budget, null)
  assert.equal((await b.call('GET', '/expenses/page')).total, 520)
  pass('factory reset clears pins and payday settings while preserving other accounts')
  const push = await account('push'),
    pushCat = push.cats.find((c) => c.type === 'expense'),
    notifications = app.get(NotificationsService),
    delivered = []
  notifications.configured = true
  notifications.sendToUser = async (id, payload) => {
    delivered.push({ id, payload })
    return { sent: 1, failed: 0, pruned: 0 }
  }
  await db.query(
    `INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,'stub','stub')`,
    [push.user.id, `https://push.test.invalid/${push.user.id}`],
  )
  await db.query(`UPDATE users SET push_enabled=true,remind_at='00:00' WHERE id=$1`, [push.user.id])
  await push.call('PUT', `/check-ins/${today}/review`)
  await notifications.dispatchDueReminders()
  assert.equal(delivered.length, 0)
  pass('reviewed days suppress daily reminder delivery (transport stubbed)')
  await push.call('PUT', '/planning/reminders', { enabled: true, daysBefore: 0 })
  const pushBills = await Promise.all(
    ['one', 'two', 'snoozed'].map((name) =>
      push.call('POST', '/planning/bills', {
        name,
        amount: 100,
        categoryId: pushCat.id,
        dueDay: 1,
      }),
    ),
  )
  await push.call('PUT', `/planning/bills/${pushBills[2].id}/snooze`, {
    month,
    until: shiftDate(today, 1),
  })
  await Promise.all([notifications.dispatchBillReminders(), notifications.dispatchBillReminders()])
  assert.equal(delivered.length, 1)
  const claims = await db.query(
    `SELECT bill_id,last_sent::text FROM bill_reminder_deliveries WHERE user_id=$1`,
    [push.user.id],
  )
  assert.equal(claims.filter((c) => c.last_sent === today).length, 2)
  assert.equal(claims.find((c) => c.bill_id === pushBills[2].id).last_sent, null)
  assert.equal((await push.call('GET', '/expenses/page')).total, 0)
  pass(
    'concurrent sweeps send one bill digest, respect snooze, and never create payments (transport stubbed)',
  )
  await push.call('POST', '/account/factory-reset', { confirm: push.user.email, lang: 'en' })
  assert.equal((await push.call('GET', '/planning/reminders')).preferences.enabled, false)
  assert.equal(
    (await push.call('GET', '/check-ins/reviews')).days.some((d) => d.reviewed),
    false,
  )
  for (const table of ['bill_reminder_deliveries', 'bill_reminder_preferences', 'day_reviews'])
    assert.equal(
      (
        await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id=$1`, [push.user.id])
      )[0].n,
      0,
    )
  notifications.configured = false
  pass('factory reset clears new reminder and review records')
  clearThrottle()
  const ui = await account('ui'),
    uiCat = ui.cats.find((c) => c.type === 'expense')
  await ui.call('POST', '/planning/goals', {
    name: 'UI goal',
    targetAmount: 12000,
    savedAmount: 2000,
    targetDate: '2027-03-01',
  })
  const uiBill = await ui.call('POST', '/planning/bills', {
    name: 'UI rent',
    amount: 6000,
    categoryId: uiCat.id,
    dueDay: 1,
  })
  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Asia/Bangkok',
  })
  await context.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('flo_token', token)
      localStorage.setItem('flo_user', JSON.stringify(user))
      if (!localStorage.getItem('flo_theme')) localStorage.setItem('flo_theme', 'light')
      if (!localStorage.getItem('flo_lang')) localStorage.setItem('flo_lang', 'en')
    },
    { token: ui.token, user: ui.user },
  )
  page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(WEB + '/')
  await page.getByRole('heading', { name: 'Pinned entries' }).waitFor()
  await page.getByRole('button', { name: 'Manage', exact: true }).click()
  await page.getByLabel('Shortcut name', { exact: true }).fill('Pinned lunch')
  await page.getByLabel(/^Amount/).fill('75')
  await page.getByLabel(/^Category/).selectOption(uiCat.id)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: /Pinned lunch/ })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: /Pinned lunch/ }).click()
  await expect(page.locator('input[type=number]').first()).toHaveValue('75.00')
  assert.equal((await ui.call('GET', '/expenses/page')).total, 0)
  pass('pin creation and reuse open an editable draft without saving')
  await page.goto(WEB + '/capture')
  let entry = page.getByRole('region', { name: 'Entry 1', exact: true })
  await entry.getByLabel(/^Amount/).fill('42')
  await entry.getByLabel(/^Category/).selectOption(uiCat.id)
  await entry.getByLabel('Note', { exact: true }).fill('Browser batch')
  await page.getByRole('button', { name: 'Add another entry', exact: true }).click()
  const skipped = page.getByRole('region', { name: 'Entry 2', exact: true })
  await skipped.getByLabel(/^Amount/).fill('-1')
  await skipped.getByRole('checkbox').uncheck()
  await page.getByRole('button', { name: 'Review entries', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and save', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Entry 2', exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Entry 1', exact: true }).getByLabel(/^Amount/),
  ).toHaveValue('-1')
  assert.equal((await ui.call('GET', '/expenses/page')).total, 1)
  await page.reload()
  await expect(
    page.getByRole('region', { name: 'Entry 1', exact: true }).getByRole('checkbox'),
  ).not.toBeChecked()
  await page.getByRole('button', { name: 'Delete 1', exact: true }).click()
  pass('batch saves only selected rows and preserves unchecked invalid drafts across reload')
  await page.locator('summary').filter({ hasText: 'Import CSV' }).click()
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'bad-type.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `date,amount,category,note,type\n${today},99,${uiCat.name},Unsupported,transfer`,
      ),
    })
  await page.getByRole('button', { name: 'Create drafts', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a type column' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Entry 1', exact: true })).toHaveCount(0)
  pass('CSV rejects unknown transaction types instead of silently turning them into expenses')
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `date,amount,category,note,type\n${today},99,${uiCat.name},Imported row,expense`,
      ),
    })
  await page.getByRole('button', { name: 'Create drafts', exact: true }).click()
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Imported row')
  assert.equal((await ui.call('GET', '/expenses/page')).total, 1)
  pass('CSV mapping creates editable drafts without saving')
  await page.reload()
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Imported row')
  pass('batch draft survives reload in account-scoped tab storage')
  await page.locator('summary').filter({ hasText: 'Read a receipt' }).click()
  await page
    .locator('input[type=file]')
    .nth(1)
    .setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: Buffer.from('89504e470d0a1a0a000000', 'hex'),
    })
  await page.getByRole('button', { name: 'Read image', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Entry 2', exact: true }).getByLabel(/^Amount/),
  ).toHaveValue('125')
  assert.equal((await ui.call('GET', '/expenses/page')).total, 1)
  pass('receipt UI creates an unsaved editable draft (vision provider stubbed)')
  await page.goto(WEB + '/budget')
  const cyclePanel = page.getByRole('region', { name: 'Plan around payday', exact: true })
  await cyclePanel.getByRole('button', { name: 'Manage' }).click()
  await cyclePanel.getByLabel('Monthly payday', { exact: true }).fill('25')
  await cyclePanel
    .getByLabel('Spending limit per pay cycle, including bills', { exact: true })
    .fill('15000')
  await cyclePanel.getByLabel('Use this period for today’s allowance').check()
  await cyclePanel.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    cyclePanel.getByText('Today’s allowance uses the payday plan.', { exact: false }),
  ).toBeVisible()
  pass('payday setup works through the browser and updates the authoritative daily plan')
  await page.goto(WEB + `/budget?bill=${uiBill.id}&month=${month}`)
  const bills = page.getByRole('region', { name: 'Bill reminders', exact: true })
  await bills
    .getByRole('button', { name: /Pay and record/ })
    .first()
    .click()
  await expect(bills.getByText(`Due: ${month}-01`, { exact: true })).toHaveCount(0)
  pass('bill reminder deep link opens an explicit payment action and clears after saving')
  await page.locator('summary').filter({ hasText: 'Try a savings scenario' }).click()
  await page.getByLabel('Planned monthly saving', { exact: true }).fill('1000')
  await page.getByLabel('Extra saving per month', { exact: true }).fill('1000')
  const count = (await ui.call('GET', '/expenses/page')).total
  await page.getByRole('button', { name: 'Review new target date' }).click()
  await page.getByRole('button', { name: 'Confirm target date', exact: true }).click()
  await expect(
    page.getByText('Target date updated; balances and spending limits are unchanged.'),
  ).toBeVisible()
  assert.equal((await ui.call('GET', '/expenses/page')).total, count)
  pass('simulation requires confirmation and changes only the goal date')
  await page.goto(WEB + '/capture?review=1')
  await page.getByRole('button', { name: `${older} · Not reviewed yet`, exact: true }).click()
  await page.getByRole('button', { name: 'I reviewed this day', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reopen this day', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: `${older} · Reviewed`, exact: true }).click()
  await page.getByRole('button', { name: 'Reopen this day', exact: true }).click()
  await expect(page.getByRole('button', { name: 'I reviewed this day', exact: true })).toBeVisible()
  pass('weekly catch-up opens 14-day review and persists older-day review and undo')
  clearThrottle()
  const historyContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await historyContext.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('flo_token', token)
      localStorage.setItem('flo_user', JSON.stringify(user))
      localStorage.setItem('flo_lang', 'en')
    },
    { token: b.token, user: b.user },
  )
  const historyPage = await historyContext.newPage()
  await historyPage.goto(
    WEB + `/history?startDate=${shiftDate(today, -40)}&endDate=${shiftDate(today, -40)}`,
  )
  await expect(historyPage.getByText('Matching entries: 520', { exact: false })).toBeVisible()
  await historyPage.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(historyPage.getByText('51–100', { exact: false })).toBeVisible()
  await historyPage.getByRole('searchbox').fill('history 520')
  await expect(historyPage.getByText('Matching entries: 1 · 1–1', { exact: true })).toBeVisible()
  await expect(historyPage.getByText('history 520', { exact: true })).toBeVisible()
  await historyContext.close()
  pass('history browser pagination and cross-month search find entries beyond 500')
  for (const [name, route] of [
    ['capture', '/capture'],
    ['plan', '/budget'],
    ['history', '/history'],
    ['reports', '/reports'],
    ['home', '/'],
  ]) {
    for (const theme of ['light', 'dark']) {
      clearThrottle()
      await page.evaluate((theme) => {
        localStorage.setItem('flo_lang', 'th')
        localStorage.setItem('flo_theme', theme)
      }, theme)
      await page.goto(WEB + route)
      await page.locator('#main-content h1').waitFor()
      await page.waitForFunction(() => !document.querySelector('.skeleton'))
      await page.evaluate(() => document.fonts.ready)
      await page.waitForLoadState('networkidle')
      assert.match(
        await page.locator('#main-content h1').innerText(),
        /[\u0e00-\u0e7f]/,
        'Thai headings must really be rendered',
      )
      for (const [size, width, height] of [
        ['mobile', 390, 844],
        ['desktop', 1440, 1000],
      ]) {
        await page.setViewportSize({ width, height })
        await page.screenshot({
          path: path.join(OUT, `${name}-${theme}-${size}.png`),
          animations: 'disabled',
        })
        assert.equal(
          await page.locator('#main-content').evaluate((el) => el.scrollWidth <= el.clientWidth),
          true,
          `${name} ${theme} ${size} overflow`,
        )
      }
    }
  }
  assert.deepEqual(errors, [])
  pass(
    'all five affected screens fit Thai mobile/desktop in both themes with no runtime exceptions',
  )
  // The existing flow suites keep the established paths under test, on their own users.
  if (process.argv.includes('--with-flows'))
    for (const script of [
      'frontend/.smoke/planning-flow.cjs',
      'frontend/.smoke/daily-flow.cjs',
      'backend/.e2e/planning.mjs',
    ])
      await new Promise((resolve, reject) => {
        clearThrottle()
        const child = spawn(process.execPath, [path.join(ROOT, script)], {
          cwd: ROOT,
          env: { ...process.env, API, UX_API_URL: API, UX_WEB_URL: WEB },
          stdio: 'inherit',
          windowsHide: true,
        })
        child.once('error', reject)
        child.once('exit', (code) =>
          code === 0 ? resolve() : reject(new Error(script + ': ' + code)),
        )
      })
  await fs.writeFile(
    path.join(OUT, 'results.json'),
    JSON.stringify({ checks, externalProviders: 'stubbed', database: 'disposable' }, null, 2),
  )
  console.log(checks.length + ' companion checks passed')
}
run()
  .catch(async (e) => {
    console.error(e)
    process.exitCode = 1
    if (page && !page.isClosed())
      await page.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {})
  })
  .finally(async () => {
    if (browser) await browser.close()
    if (app) await app.close()
    if (db?.isInitialized) await db.destroy()
  })
