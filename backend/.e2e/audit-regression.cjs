// Regression for the 2026-09-21 audit. Only the disposable loopback database below.
// Start Vite on 5174 with VITE_API_URL=http://127.0.0.1:3098, then run this file.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
process.chdir(__dirname) // Never load the project's .env / production credentials.
for (const key of Object.keys(process.env)) {
  if (/DATABASE_URL|GOOGLE_CLIENT_ID|FACEBOOK_APP_|BREVO_|TAVILY_|OPENROUTER_|VAPID_|CRON_SECRET|TRUST_PROXY_HOPS/.test(key)) delete process.env[key]
}
Object.assign(process.env, { NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: '15434', DB_USER: 'expense_user', DB_PASSWORD: 'fix-local-only', DB_NAME: 'moneyflow_fix_test', JWT_SECRET: 'local-regression-secret-never-use-in-production', CORS_ORIGIN: 'http://127.0.0.1:5174,http://localhost:5174' })
const webpush = require('web-push')
const vapid = webpush.generateVAPIDKeys()
process.env.VAPID_PUBLIC_KEY = vapid.publicKey
process.env.VAPID_PRIVATE_KEY = vapid.privateKey
require('reflect-metadata')
const axios = require('axios')
const runId = Date.now()
const email = `audit-${runId}@test.local`
const socialEmail = `social-${runId}@test.local`
const calls = []
axios.get = async (url, opts) => {
  calls.push(url)
  if (url === 'https://oauth2.googleapis.com/tokeninfo') return { data: { aud: opts.params.access_token === 'wrong-audience' ? 'other-app' : 'audit-google' } }
  if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') return { data: { sub: `google-${runId}`, name: 'Verified fixture', email: opts.headers.Authorization.endsWith('collision') ? email : socialEmail, email_verified: true } }
  if (url === 'https://graph.facebook.com/debug_token') return { data: { data: { is_valid: true, app_id: 'audit-facebook' } } }
  if (url === 'https://graph.facebook.com/me') return { data: { id: `facebook-${runId}`, name: 'No email fixture' } }
  throw new Error('External HTTP disabled in regression')
}
axios.post = async () => { throw new Error('External HTTP disabled in regression') }
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/app.module')
const { configureApp } = require('../dist/config/configure-app')
const { DataSource } = require('typeorm')
const { databaseConfig } = require('../dist/config/database.config')
const { publicAddress, pushUrl } = require('../dist/modules/notifications/push-endpoint')
let app, browser, checks = 0
const results = []
function pass(name) { checks++; results.push(name); console.log('PASS', name) }
const API = 'http://127.0.0.1:3098/api'
async function request(method, endpoint, body, token, headers = {}) {
  const response = await fetch(API + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  const raw = await response.text()
  return { status: response.status, body: raw ? JSON.parse(raw) : null }
}
async function ok(method, endpoint, body, token) {
  const r = await request(method, endpoint, body, token)
  assert.ok(r.status < 300, `${method} ${endpoint}: ${r.status} ${JSON.stringify(r.body)}`)
  return r.body
}
async function run() {
  const migrationDb = new DataSource(databaseConfig())
  await migrationDb.initialize()
  assert.equal((await migrationDb.query('SELECT current_database() AS name'))[0].name, 'moneyflow_fix_test')
  await migrationDb.runMigrations()
  await migrationDb.destroy()
  app = await NestFactory.create(AppModule, { logger: false })
  configureApp(app)
  await app.listen(3098, '127.0.0.1')
  const db = app.get(DataSource)
  const account = await ok('POST', '/auth/register', { email, password: 'audit-password-123', name: 'Audit', lang: 'en' })
  const token = account.accessToken
  await ok('POST', '/auth/onboarding', { trackingMode: 'plan', monthlySpendingLimit: 30000, timezone: 'Asia/Bangkok' }, token)
  const cats = await ok('GET', '/categories', undefined, token)
  const category = cats.find(c => c.type === 'expense')

  for (const [route, body] of [['google', { token: 'fixture' }], ['facebook', { accessToken: 'fixture' }]]) {
    assert.equal((await request('POST', `/auth/${route}/verify`, body)).status, 401)
  }
  assert.equal(calls.length, 0)
  pass('unconfigured OAuth fails closed before calling provider')
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'audit-google', FACEBOOK_APP_ID: 'audit-facebook', FACEBOOK_APP_SECRET: 'test-only' })
  assert.equal((await request('POST', '/auth/google/verify', { token: 'wrong-audience' })).status, 401)
  assert.equal((await request('POST', '/auth/facebook/verify', { accessToken: 'fixture', email })).status, 400)
  assert.equal((await request('POST', '/auth/google/verify', { token: 'collision' })).status, 409)
  const [unchanged] = await db.query('SELECT google_id,facebook_id FROM users WHERE id=$1', [account.user.id])
  assert.deepEqual(unchanged, { google_id: null, facebook_id: null })
  pass('wrong audience and unverified email rejected; local account cannot be auto-merged')
  const social = await ok('POST', '/auth/google/verify', { token: 'verified' })
  assert.equal((await ok('POST', '/auth/google/verify', { token: 'verified' })).user.id, social.user.id)
  pass('verified new social account and returning social login work')

  const reset = crypto.randomBytes(32).toString('hex')
  await db.query("UPDATE users SET facebook_id=$3,reset_token=$1,reset_token_expiry=now()+interval '10 minutes' WHERE id=$2", [crypto.createHash('sha256').update(reset).digest('hex'), social.user.id, `legacy-${runId}`])
  const resets = await Promise.all(['password-a-123', 'password-b-123'].map(password => request('POST', '/auth/reset-password', { token: reset, password })))
  assert.deepEqual(resets.map(r => r.status).sort(), [201, 400])
  const [recovered] = await db.query('SELECT google_id,facebook_id,reset_token,token_version FROM users WHERE id=$1', [social.user.id])
  assert.deepEqual(recovered, { google_id: null, facebook_id: null, reset_token: null, token_version: 1 })
  assert.equal((await request('GET', '/auth/me', undefined, social.accessToken)).status, 401)
  assert.equal((await request('POST', '/auth/google/verify', { token: 'verified' })).status, 409)
  pass('reset token consumed once; old sessions and social credentials revoked')

  const statuses = []
  for (let i = 0; i < 4; i++) statuses.push((await request('POST', '/auth/forgot-password', { email: 'missing@test.local' }, undefined, { 'X-Forwarded-For': `192.0.2.${10 + i}` })).status)
  assert.deepEqual(statuses, [201, 201, 201, 429])
  pass('changing forwarded IP cannot bypass direct-server rate limit')
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1']) assert.equal(publicAddress(ip), false)
  assert.equal(publicAddress('8.8.8.8'), true)
  for (const url of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.attacker.test/x', 'https://fcm.googleapis.com:444/x']) assert.throws(() => pushUrl(url))
  const key = crypto.createECDH('prime256v1'); key.generateKeys()
  const subscription = { endpoint: 'https://127.0.0.1:19443/audit', keys: { p256dh: key.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } }
  assert.equal((await request('POST', '/notifications/subscriptions', { subscription }, token)).status, 400)
  subscription.endpoint = 'https://fcm.googleapis.com/fcm/send/test-fixture'
  await ok('POST', '/notifications/subscriptions', { subscription }, token)
  await ok('DELETE', '/notifications/subscriptions', {}, token)
  pass('SSRF endpoints and non-public IPs rejected; valid push registration accepted')

  const expense = await ok('POST', '/expenses', { type: 'expense', amount: 25, categoryId: category.id, occurredAt: new Date().toISOString() }, token)
  for (const field of ['amount', 'type', 'categoryId', 'occurredAt']) assert.equal((await request('PATCH', '/expenses/' + expense.id, { [field]: null }, token)).status, 400)
  assert.equal(Number((await ok('GET', '/expenses/' + expense.id, undefined, token)).amount), 25)
  pass('null financial patch fields rejected with 400; ledger unchanged')
  const other = await ok('POST', '/auth/register', { email: `other-${email}`, password: 'audit-password-123', name: 'Other' })
  assert.equal((await request('GET', '/expenses')).status, 401)
  assert.equal((await request('GET', '/expenses/' + expense.id, undefined, other.accessToken)).status, 404)
  assert.equal((await request('GET', '/admin/users', undefined, token)).status, 403)
  pass('authentication and cross-account/admin boundaries retained')

  const input = { name: 'Audit recurring', amount: 6000, categoryId: category.id, dueDay: 31 }
  const bill = await ok('POST', '/planning/bills', input, token)
  const state = await ok('GET', '/planning', undefined, token)
  const [y, m] = state.month.split('-').map(Number)
  const previous = new Date(Date.UTC(y, m - 2)).toISOString().slice(0, 7)
  await db.query('UPDATE recurring_bills SET start_month=$1 WHERE id=$2', [previous, bill.id])
  let plan = await ok('GET', '/planning', undefined, token)
  assert.equal(plan.unpaidBills, 12000)
  assert.equal(plan.bills.filter(b => b.id === bill.id).length, 2)
  await ok('PUT', '/planning/bills/' + bill.id, { ...input, amount: 7000 }, token)
  plan = await ok('GET', '/planning', undefined, token)
  assert.equal(plan.bills.find(b => b.month === previous).amount, 6000)
  assert.equal(plan.bills.find(b => b.month === state.month).amount, 7000)
  pass('unpaid cycles carry forward and previous amounts survive template edits')
  const before = await ok('GET', '/analytics/daily-brief', undefined, token)
  const paid = await Promise.all([1, 2, 3].map(() => ok('POST', `/planning/bills/${bill.id}/pay`, { month: previous }, token)))
  assert.equal(new Set(paid.map(p => p.expenseId)).size, 1)
  const after = await ok('GET', '/analytics/daily-brief', undefined, token)
  assert.equal(after.safeToday, before.safeToday)
  assert.equal(after.monthSpent - before.monthSpent, 6000)
  await ok('PATCH', '/expenses/' + paid[0].expenseId, { note: 'Late bill' }, token)
  await ok('PATCH', '/expenses/' + paid[0].expenseId, { occurredAt: new Date().toISOString() }, token)
  assert.equal((await request('PATCH', '/expenses/' + paid[0].expenseId, { occurredAt: previous + '-15T12:00:00+07:00' }, token)).status, 400)
  await ok('DELETE', '/expenses/' + paid[0].expenseId, undefined, token)
  assert.equal((await ok('GET', '/planning', undefined, token)).unpaidBills, 13000)
  pass('concurrent late payment happens once, preserves daily allowance, deletion reopens original cycle')
  await ok('PUT', `/planning/bills/${bill.id}/occurrences/${previous}`, { ...input, amount: 5500 }, token)
  await ok('DELETE', '/planning/bills/' + bill.id, undefined, token)
  assert.equal((await ok('GET', '/planning', undefined, token)).unpaidBills, 12500)
  assert.equal((await request('DELETE', `/planning/bills/${bill.id}/occurrences/${previous}`, undefined, other.accessToken)).status, 404)
  await ok('DELETE', `/planning/bills/${bill.id}/occurrences/${previous}`, undefined, token)
  await ok('DELETE', `/planning/bills/${bill.id}/occurrences/${state.month}`, undefined, token)
  assert.equal((await ok('GET', '/planning', undefined, token)).unpaidBills, 0)
  pass('archive retains debts; individual edit/waiver works and respects ownership')

  const { chromium, expect } = require('playwright/test')
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 } })
  const user = await ok('GET', '/auth/me', undefined, token)
  await context.addInitScript(({ token, user }) => { localStorage.setItem('flo_token', token); localStorage.setItem('flo_user', JSON.stringify(user)); localStorage.setItem('flo_lang', 'en') }, { token, user })
  const page = await context.newPage()
  let firstPayload
  await page.route(url => url.pathname === '/api/expenses', async route => {
    if (route.request().method() !== 'POST' || firstPayload) return route.continue()
    firstPayload = route.request().postDataJSON()
    assert.ok((await route.fetch()).ok())
    await route.abort('failed')
  })
  await page.goto('http://127.0.0.1:5174/add')
  await page.locator('#amount').fill('123.45')
  await page.getByRole('button', { name: category.name, exact: true }).click()
  await page.locator('button[type=submit]').first().click()
  await expect.poll(async () => !!firstPayload).toBe(true)
  await expect(page).toHaveURL('http://127.0.0.1:5174/')
  await page.evaluate(async () => {
    const q = await import('/src/utils/offlineQueue.ts')
    const { expensesApi } = await import('/src/api/index.ts')
    await q.flush(JSON.parse(localStorage.getItem('flo_user')).id, p => expensesApi.create(p), true)
  })
  assert.ok(firstPayload.clientKey)
  const [{ count }] = await db.query('SELECT count(*)::int FROM expenses WHERE user_id=$1 AND amount=123.45', [user.id])
  assert.equal(count, 1)
  pass('lost online response followed by actual browser queue replay produces one transaction')
  const queueResult = await page.evaluate(async categoryId => {
    const q = await import('/src/utils/offlineQueue.ts')
    const uid = JSON.parse(localStorage.getItem('flo_user')).id
    const entry = await q.enqueue(uid, { categoryId, type: 'expense', amount: 99, occurredAt: new Date().toISOString(), note: 'Queue fixture' })
    for (let i = 0; i < 6; i++) await q.flush(uid, async () => { throw { response: { status: 503 } } }, true)
    const retained = (await q.listPending(uid)).find(e => e.id === entry.id)
    await q.flush(uid, async () => { throw { response: { status: 400 } } }, true)
    window.dispatchEvent(new Event('moneyflow:queued'))
    return { retained: !!retained, attempts: retained.attempts }
  }, category.id)
  assert.deepEqual(queueResult, { retained: true, attempts: 6 })
  await page.getByRole('button', { name: /View entries/ }).click()
  await expect(page.getByText('Queue fixture', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => (await db.query("SELECT count(*)::int AS n FROM expenses WHERE user_id=$1 AND note='Queue fixture'", [user.id]))[0].n).toBe(1)
  pass('six temporary failures retain entry; review/edit/resend UI recovers it')
  const uiBill = await ok('POST', '/planning/bills', { ...input, name: 'Late UI bill', amount: 300 }, token)
  await db.query('UPDATE recurring_bills SET start_month=$1 WHERE id=$2', [previous, uiBill.id])
  await page.goto('http://127.0.0.1:5174/budget')
  const billsRegion = page.getByRole('region', { name: 'Monthly and outstanding bills', exact: true })
  const billRows = billsRegion.getByRole('listitem').filter({ hasText: 'Late UI bill' })
  await expect(billRows).toHaveCount(2)
  await billRows.first().getByRole('button', { name: 'Pay bill', exact: true }).click()
  await expect(billsRegion.getByRole('button', { name: /Pay and record/ })).toHaveCount(1)
  await billsRegion.getByRole('button', { name: /Pay and record/ }).click()
  await expect.poll(async () => (await ok('GET', '/planning', undefined, token)).bills.find(b => b.id === uiBill.id && b.month === previous)?.status).toBe('paid')
  const unpaidUiRow = billRows.filter({ has: page.getByRole('button', { name: 'Pay bill', exact: true }) })
  await expect(unpaidUiRow).toHaveCount(1)
  await unpaidUiRow.getByRole('button', { name: 'Cancel this cycle', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect.poll(async () => (await ok('GET', '/planning', undefined, token)).unpaidBills).toBe(0)
  pass('browser pays the selected overdue cycle only and cancels the other cycle')

  const passwordUser = await ok('POST', '/auth/register', { email: `password-${email}`, password: 'password-old-123', name: 'Password fixture' })
  const changed = await Promise.all(['password-new-a', 'password-new-b'].map(newPassword => request('PATCH', '/auth/change-password', { currentPassword: 'password-old-123', newPassword }, passwordUser.accessToken)))
  assert.deepEqual(changed.map(r => r.status).sort(), [200, 401])
  assert.equal((await request('GET', '/auth/me', undefined, passwordUser.accessToken)).status, 401)
  pass('concurrent password changes cannot overwrite the winning credential or reuse its version')

  await db.query("INSERT INTO expenses(id,user_id,category_id,amount,type,note,occurred_at) SELECT gen_random_uuid(),$1,$2,1,'expense','audit-export-fixture',($3||'-15T12:00:00+07:00')::timestamptz FROM generate_series(1,600)", [user.id, category.id, previous])
  await page.goto('http://127.0.0.1:5174/history')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByLabel('From', { exact: true }).fill(previous)
  await page.getByLabel('To', { exact: true }).fill(previous)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const stream = await (await downloadPromise).createReadStream()
  const chunks = []; for await (const c of stream) chunks.push(c)
  assert.equal((Buffer.concat(chunks).toString('utf8').match(/audit-export-fixture/g) || []).length, 600)
  pass('actual History CSV download includes all 600 transactions')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  pass('changed flow fits mobile viewport')
  let navigation = '/\\example.invalid'
  await page.route('**/api/chat/stream', route => route.fulfill({
    status: 200, contentType: 'text/event-stream',
    body: `event: action\ndata: ${JSON.stringify({ navigate: navigation })}\n\ndata: ${JSON.stringify({ content: 'Navigation fixture' })}\n\ndata: [DONE]\n\n`,
  }))
  await page.goto('http://127.0.0.1:5174/more')
  await page.getByRole('button', { name: /AI Assistant/ }).click()
  await page.locator('textarea').fill('navigation test')
  await page.locator('textarea').press('Enter')
  await expect(page.getByText('Navigation fixture', { exact: true })).toBeVisible()
  // Longer than the navigation action delay; a rejected path must never navigate later.
  await page.waitForTimeout(1000)
  await expect(page).toHaveURL('http://127.0.0.1:5174/more')
  navigation = '/history'
  await page.locator('textarea').fill('valid navigation')
  await page.locator('textarea').press('Enter')
  await expect(page).toHaveURL('http://127.0.0.1:5174/history')
  pass('untrusted chat navigation is restricted to known app routes; valid actions still work')
  await context.close()
}
run().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (browser) await browser.close()
  if (app) await app.close()
  console.log(`${checks} audit regression checks passed`)
  if (!process.exitCode) fs.writeFileSync(path.resolve(__dirname, '../../docs/audits/2026-09-22-regression.json'), JSON.stringify({ checks, results }, null, 2) + '\n')
})
