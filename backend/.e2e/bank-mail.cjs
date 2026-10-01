// Real disposable Postgres + API + browser; Google network calls use synthetic mail.
// Start postgres per docs/gmail-bank-import.md, then build backend and run this file.
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs/promises')
const ROOT = path.resolve(__dirname, '../..'), WEB = 'http://127.0.0.1:5176', API = 'http://127.0.0.1:3095/api'
process.chdir(__dirname) // Never load the developer's backend/.env.
for (const key of Object.keys(process.env)) if (/DATABASE_URL|GOOGLE_|FACEBOOK_|BREVO_|TAVILY_|OPENROUTER_|VAPID_|GMAIL_|CRON_SECRET/.test(key)) delete process.env[key]
Object.assign(process.env, { NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: '15436', DB_NAME: 'moneyflow_mail_test',
  DB_USER: 'expense_user', DB_PASSWORD: 'mail-local-only', JWT_SECRET: 'gmail-test-only-not-a-production-secret',
  CORS_ORIGIN: WEB, FRONTEND_URL: WEB, TRUST_PROXY_HOPS: '0', CRON_SECRET: 'synthetic-cron-secret',
  GMAIL_CLIENT_ID: 'synthetic-client', GMAIL_CLIENT_SECRET: 'synthetic-secret',
  GMAIL_REDIRECT_URI: 'http://127.0.0.1:3095/api/bank-mail/gmail/callback',
  BANK_MAIL_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), VITE_API_URL: 'http://127.0.0.1:3095',
  VITE_GOOGLE_CLIENT_ID: '', VITE_FACEBOOK_APP_ID: '' })
require('reflect-metadata')
const { NestFactory } = require('@nestjs/core'), { DataSource } = require('typeorm')
const { AppModule } = require('../dist/app.module'), { databaseConfig } = require('../dist/config/database.config'), { configureApp } = require('../dist/config/configure-app')
const { GmailProvider, GmailFailure } = require('../dist/modules/bank-mail/gmail.provider'), { BankMailService } = require('../dist/modules/bank-mail/bank-mail.service')
const { chromium, expect } = require('playwright/test')
let db, app, browser, vite, page, clearThrottle
const checks = [], pass = text => { checks.push(text); console.log('PASS', text) }
async function request(method, route, data, token, expected, headers = {}) {
  const res = await fetch(API + route, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...headers, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) })
  if (res.status === 303) { assert.equal(expected, 303); return new URL(res.headers.get('location')) }
  const text = await res.text()
  assert.ok(expected ? res.status === expected : res.ok, `${method} ${route}: ${res.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}
async function account(label) {
  clearThrottle()
  const auth = await request('POST', '/auth/register', { email: `mail-${label}-${Date.now()}@test.local`, name: 'Mail Test', password: 'mail-fixture-123', lang: 'th' })
  const call = (m, r, b, s) => request(m, r, b, auth.accessToken, s)
  await call('POST', '/auth/onboarding', { trackingMode: 'plan', monthlySpendingLimit: 30000, timezone: 'Asia/Bangkok', lang: 'th' })
  const user = await call('GET', '/auth/me'), cats = await call('GET', '/categories')
  return { token: auth.accessToken, call, user, cats, settings: { autoImport: true, expenseCategoryId: cats.find(c => c.type === 'expense').id, incomeCategoryId: cats.find(c => c.type === 'income').id, ownAccounts: ['ktb:1111', 'scb:2222'] } }
}
function message(id, amount, { received = Date.now(), destination = '9999', fee = '0.00', bank = 'ktb' } = {}) {
  const d = new Date(Date.now() + 7 * 3600000 - 60000), pad = n => String(n).padStart(2, '0')
  const stamp = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear() + 543} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const body = bank === 'ktb' ? `<p>คุณได้ทำรายการโอนเงินผ่าน Krungthai NEXT สำเร็จ</p><p>วันที่ทำรายการ : ${stamp}</p><p>หมายเลขอ้างอิง : FIXTURE00${id}</p><p>จากบัญชี : นายผู้ทดสอบ ก</p><p>เลขบัญชี : กรุงไทย XXX-X-XX111-1</p><p>ไปยังบัญชี : นางผู้รับ ข</p><p>เลขบัญชี : ไทยพาณิชย์ XXXXXX${destination}</p><p>จำนวนเงิน : ${amount.toFixed(2)} บาท</p><p>ค่าธรรมเนียม : ${fee} บาท</p>`
    : `จาก: KTB / xxxxxx${destination}<BR>จำนวน (บาท): ${amount.toFixed(2)}<BR>เข้าบัญชี: xxxxxx2222<BR>วัน/เวลา: ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear() + 543} - ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  const domain = bank === 'ktb' ? 'krungthai.com' : 'scb.co.th'
  return { id, internalDate: String(received), payload: { mimeType: 'text/html', body: { data: Buffer.from(body).toString('base64url') }, headers: [
    { name: 'From', value: bank === 'ktb' ? 'noreply@krungthai.com' : 'scbeasynet@scb.co.th' },
    { name: 'Subject', value: bank === 'ktb' ? 'แจ้งผลการโอนเงินสำเร็จ' : 'SCB Easy App: คุณได้รับเงินผ่านรายการพร้อมเพย์' },
    { name: 'Authentication-Results', value: `mx.google.com; dkim=pass header.i=@${domain}; dmarc=pass header.from=${domain}` },
  ] } }
}
async function run() {
  db = new DataSource(databaseConfig()); await db.initialize()
  assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'moneyflow_mail_test')
  await db.runMigrations()
  await db.query("DELETE FROM users WHERE email LIKE 'mail-%@test.local'")
  app = await NestFactory.create(AppModule, { logger: false, bodyParser: false }); configureApp(app); await app.listen(3095, '127.0.0.1')
  clearThrottle = () => app.get(require('@nestjs/throttler').getStorageToken()).storage.clear()
  const gmail = app.get(GmailProvider), service = app.get(BankMailService), mailboxes = new Map()
  gmail.exchange = async code => ({ address: `${code}@gmail.test`, refreshToken: `refresh:${code}` })
  gmail.refresh = async token => token.slice('refresh:'.length)
  gmail.revoke = async () => true
  gmail.list = async token => ({ messages: (mailboxes.get(token) ?? []).map(m => ({ id: m.id })) })
  gmail.message = async (token, id) => mailboxes.get(token).find(m => m.id === id)
  async function connect(a, code) {
    clearThrottle()
    const start = new URL((await a.call('POST', '/bank-mail/connect')).url), state = start.searchParams.get('state')
    assert.equal(start.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly')
    assert.equal(start.searchParams.get('code_challenge_method'), 'S256')
    const dest = await request('GET', `/bank-mail/gmail/callback?state=${state}&code=${code}`, undefined, null, 303)
    assert.equal(dest.origin, WEB); assert.equal(dest.search, '?gmail=complete')
    const fragment = Object.fromEntries(new URLSearchParams(dest.hash.slice(1)))
    assert.equal((await a.call('POST', '/bank-mail/complete', fragment)).connected, true)
    assert.equal((await a.call('POST', '/bank-mail/complete', fragment)).connected, false)
  }
  const a = await account('a'), b = await account('b')
  await request('GET', '/bank-mail/status', undefined, null, 401)
  await request('POST', '/bank-mail/dispatch', undefined, null, 403)
  await connect(a, 'alpha'); await connect(b, 'bravo')
  const state = (await a.call('GET', '/bank-mail/status'))
  assert.equal(state.gmailAddress, 'alpha@gmail.test'); assert.ok(!JSON.stringify(state).includes('refresh'))
  const cipher = (await db.query('SELECT refresh_cipher FROM bank_mail_connections WHERE user_id=$1', [a.user.id]))[0].refresh_cipher
  assert.ok(!cipher.includes('refresh:alpha'))
  await b.call('PUT', '/bank-mail/settings', a.settings, 400)
  await a.call('PUT', '/bank-mail/settings', { ...a.settings, autoImport: 'false' }, 400)
  await a.call('PUT', '/bank-mail/settings', { ...a.settings, ownAccounts: [] }, 400)
  const crossState = new URL((await a.call('POST', '/bank-mail/connect')).url).searchParams.get('state')
  assert.equal((await b.call('POST', '/bank-mail/complete', { state: crossState, code: 'stolen' })).connected, false)
  pass('JWT, cron secret, per-user OAuth state, replay, encrypted tokens and category ownership enforced')
  mailboxes.set('alpha', [message('a1', 31, { received: Date.now() - 3600000 })])
  // Put a genuinely historical transaction time before the historical received time.
  mailboxes.get('alpha')[0].internalDate = String(Date.now() - 30000)
  await a.call('POST', '/bank-mail/sync')
  let pending = (await a.call('GET', '/bank-mail/entries')).rows
  assert.equal(pending.length, 1); assert.equal(pending[0].status, 'pending')
  await b.call('POST', `/bank-mail/entries/${pending[0].id}/ignore`, {}, 404)
  await b.call('POST', `/bank-mail/entries/${pending[0].id}/save`, { categoryId: b.settings.expenseCategoryId, type: 'expense' }, 404)
  assert.equal((await b.call('GET', '/bank-mail/entries')).total, 0)
  await a.call('PUT', '/bank-mail/settings', a.settings); await b.call('PUT', '/bank-mail/settings', b.settings)
  // Model mail arriving after opt-in, without sleeping for clock resolution.
  await db.query('UPDATE bank_mail_connections SET auto_import_since=now()-interval \'10 seconds\' WHERE user_id = ANY($1)', [[a.user.id, b.user.id]])
  mailboxes.set('alpha', [message('a2', 100), message('a3', 200, { destination: '2222' }), message('a4', 20, { fee: '2.00' }), message('a5', 70, { bank: 'scb' })])
  mailboxes.set('bravo', [message('b1', 12)])
  clearThrottle()
  await Promise.all([a.call('POST', '/bank-mail/sync'), a.call('POST', '/bank-mail/sync'), b.call('POST', '/bank-mail/sync')])
  await a.call('POST', '/bank-mail/sync')
  const saved = (await a.call('GET', '/bank-mail/entries?status=saved')).rows
  assert.equal(saved.length, 2)
  assert.equal((await b.call('GET', '/bank-mail/entries?status=saved')).total, 1)
  assert.equal(Number((await db.query('SELECT total_balance FROM users WHERE id=$1', [a.user.id]))[0].total_balance), -30)
  pending = (await a.call('GET', '/bank-mail/entries')).rows
  assert.ok(pending.some(e => e.reason === 'possible_transfer')); assert.ok(pending.some(e => e.reason === 'fee_review'))
  pass('multi-user concurrent sync records income/expense once; old mail, own transfers and fees stay in review')
  const feeEntry = pending.find(e => e.reason === 'fee_review')
  await a.call('POST', `/bank-mail/entries/${feeEntry.id}/save`, { categoryId: b.settings.expenseCategoryId, type: 'expense' }, 404)
  await a.call('POST', `/bank-mail/entries/${feeEntry.id}/save`, { categoryId: a.settings.expenseCategoryId, type: 'expense' })
  await a.call('POST', `/bank-mail/entries/${feeEntry.id}/save`, { categoryId: a.settings.expenseCategoryId, type: 'expense' })
  const original = mailboxes.get('alpha')[0], dupe = { ...original, id: 'a6' }
  // A different bank reference but identical amount/time requires review, not double counting.
  dupe.payload = { ...original.payload, body: { data: Buffer.from(Buffer.from(original.payload.body.data, 'base64url').toString().replace('FIXTURE00a2', 'FIXTURE00a6')).toString('base64url') } }
  mailboxes.set('alpha', [dupe]); await a.call('POST', '/bank-mail/sync')
  const duplicate = (await a.call('GET', '/bank-mail/entries')).rows.find(e => e.reason === 'possible_duplicate')
  assert.ok(duplicate)
  await a.call('POST', `/bank-mail/entries/${duplicate.id}/save`, { categoryId: a.settings.expenseCategoryId, type: 'expense' }, 409)
  assert.equal(Number((await db.query('SELECT total_balance FROM users WHERE id=$1', [a.user.id]))[0].total_balance), -52)
  pass('review saves use the ledger atomically, include fees, remain idempotent and block duplicates')
  clearThrottle()
  const priorList = gmail.list
  gmail.list = async () => { throw new GmailFailure('page_expired') }
  await a.call('POST', '/bank-mail/sync', {}, 503)
  assert.equal((await a.call('GET', '/bank-mail/status')).syncing, false)
  gmail.list = priorList
  await a.call('POST', '/bank-mail/sync')
  pass('provider failures release the per-account lease and allow safe retry')
  // Disconnect while a fetched message is in flight: it must never recreate data.
  let release, entered
  const enteredPromise = new Promise(r => { entered = r }), blocked = new Promise(r => { release = r }), priorMessage = gmail.message
  mailboxes.set('bravo', [message('b2', 51)])
  gmail.message = async (token, id) => { if (token === 'bravo') { entered(); await blocked }; return priorMessage(token, id) }
  const syncing = service.sync(b.user.id).catch(() => null)
  await enteredPromise; await b.call('DELETE', '/bank-mail/connection'); release(); await syncing; gmail.message = priorMessage
  assert.equal((await b.call('GET', '/bank-mail/status')).connected, false)
  assert.equal((await b.call('GET', '/bank-mail/entries?status=saved')).total, 1)
  pass('disconnect cancels an in-flight importer without affecting the other user')
  // Fair scheduling advances recently attempted accounts behind unattempted accounts.
  await connect(b, 'bravo'); mailboxes.set('bravo', [])
  const called = [], oldSync = service.sync.bind(service)
  service.sync = async id => { called.push(id); return oldSync(id) }
  clearThrottle()
  await request('POST', '/bank-mail/dispatch', undefined, null, 200, { 'x-cron-secret': process.env.CRON_SECRET })
  assert.equal(called[0], b.user.id); service.sync = oldSync
  pass('authenticated scheduled dispatch prioritizes accounts not yet attempted')
  const windows = []
  mailboxes.set('bravo', Array.from({ length: 6 }, (_, i) => message('b' + (10 + i), 110 + i)))
  gmail.list = async (token, after, before, cursor) => {
    if (token !== 'bravo') return priorList(token)
    windows.push([after.toISOString(), before.toISOString()])
    const all = mailboxes.get(token).map(m => ({ id: m.id }))
    return cursor ? { messages: all.slice(5) } : { messages: all.slice(0, 5), nextPageToken: 'synthetic-next-page' }
  }
  const firstPage = await b.call('POST', '/bank-mail/sync')
  assert.equal(firstPage.continued, true)
  assert.equal((await b.call('POST', '/bank-mail/sync')).continued, false)
  assert.deepEqual(windows[0], windows[1])
  assert.equal((await b.call('GET', '/bank-mail/entries')).total, 6)
  gmail.list = priorList
  pass('pagination resumes a fixed window without losing or repeating detected entries')
  // A slower, already-consumed OAuth callback cannot overwrite a newer completed flow.
  const normalExchange = gmail.exchange
  let finishExchange, exchangeEntered
  const waitExchange = new Promise(r => { finishExchange = r }), waitEntered = new Promise(r => { exchangeEntered = r })
  gmail.exchange = async code => { if (code === 'superseded') { exchangeEntered(); await waitExchange }; return normalExchange(code) }
  clearThrottle()
  const oldState = new URL((await b.call('POST', '/bank-mail/connect')).url).searchParams.get('state')
  const oldComplete = b.call('POST', '/bank-mail/complete', { state: oldState, code: 'superseded' })
  await waitEntered; await connect(b, 'bravo'); finishExchange()
  assert.equal((await oldComplete).connected, false)
  assert.equal((await b.call('GET', '/bank-mail/status')).gmailAddress, 'bravo@gmail.test')
  gmail.exchange = normalExchange
  const expired = new URL((await b.call('POST', '/bank-mail/connect')).url).searchParams.get('state')
  await db.query('UPDATE bank_mail_connections SET state_expires_at=now()-interval \'1 minute\' WHERE user_id=$1', [b.user.id])
  assert.equal((await b.call('POST', '/bank-mail/complete', { state: expired, code: 'expired' })).connected, false)
  pass('expired or superseded OAuth attempts cannot replace a newer user connection')

  const c = await account('bills'); await connect(c, 'charlie')
  await c.call('PUT', '/bank-mail/settings', { ...c.settings, autoImport: false })
  function billMessage(id, amount, options = {}) {
    const m = message(id, amount, options)
    m.payload.headers.find(h => h.name === 'Subject').value = 'แจ้งผลการจ่ายบิลสำเร็จ'
    const html = Buffer.from(m.payload.body.data, 'base64url').toString()
      .replace('คุณได้ทำรายการโอนเงินผ่าน', 'คุณได้จ่ายบิลผ่าน')
      .replace(/<p>ไปยังบัญชี :.*?<\/p><p>เลขบัญชี :.*?<\/p>/, '<p>ไปยังผู้ให้บริการ : EXAMPLE BILLER CO., LTD.</p>')
      .replace('จำนวนเงิน :', 'จำนวนเงินที่ชำระ :')
    m.payload.body.data = Buffer.from(html).toString('base64url')
    return m
  }
  const historicalBill = billMessage('c1', 10, { received: Date.now() - 30000 })
  mailboxes.set('charlie', [historicalBill])
  const firstBill = await c.call('POST', '/bank-mail/sync')
  assert.deepEqual(firstBill.summary, { matched: 1, existing: 0, parsed: 1, skipped: 0, skipReasons: {} })
  assert.equal((await c.call('GET', '/bank-mail/entries')).rows[0].transaction.kind, 'bill_payment')
  await c.call('PUT', '/bank-mail/settings', c.settings)
  await db.query("UPDATE bank_mail_connections SET auto_import_since=now()-interval '10 seconds' WHERE user_id=$1", [c.user.id])
  const newBill = billMessage('c2', 45), feeBill = billMessage('c3', 20, { fee: '2.00' }), unknownBill = billMessage('c4', 30)
  unknownBill.payload.body.data = Buffer.from(Buffer.from(unknownBill.payload.body.data, 'base64url').toString().replace('XXX-X-XX111-1', 'XXX-X-XX555-5')).toString('base64url')
  mailboxes.set('charlie', [historicalBill, newBill, feeBill, unknownBill])
  const billResult = await c.call('POST', '/bank-mail/sync')
  assert.deepEqual(billResult.summary, { matched: 4, existing: 1, parsed: 3, skipped: 0, skipReasons: {} })
  const savedBills = (await c.call('GET', '/bank-mail/entries?status=saved')).rows
  assert.equal(savedBills.length, 1); assert.equal(savedBills[0].transaction.amount, 45)
  const reviewBills = (await c.call('GET', '/bank-mail/entries')).rows
  assert.equal(reviewBills.length, 3)
  for (const reason of ['review_required', 'fee_review', 'account_required']) assert.ok(reviewBills.some(row => row.reason === reason))
  assert.equal((await c.call('POST', '/bank-mail/sync')).summary.existing, 4)
  assert.equal(Number((await db.query('SELECT total_balance FROM users WHERE id=$1', [c.user.id]))[0].total_balance), -45)
  pass('KTB bills record once without a recipient account; historical mail, fees and unknown payers require review')

  const malformed = billMessage('c6', 60), unverified = billMessage('c7', 70)
  malformed.payload.body.data = Buffer.from(Buffer.from(malformed.payload.body.data, 'base64url').toString().replace('60.00 บาท', 'ไม่ทราบ')).toString('base64url')
  unverified.payload.headers.find(h => h.name === 'Authentication-Results').value = 'mx.google.com; dkim=fail; dmarc=fail'
  mailboxes.set('charlie', [malformed, unverified])
  const skippedResult = await c.call('POST', '/bank-mail/sync')
  assert.deepEqual(skippedResult.summary, { matched: 2, existing: 0, parsed: 0, skipped: 2,
    skipReasons: { ambiguous_template: 1, unverified_sender: 1 } })
  assert.ok(!JSON.stringify(skippedResult).includes('EXAMPLE BILLER'))
  mailboxes.set('charlie', []); clearThrottle()
  assert.deepEqual((await c.call('POST', '/bank-mail/sync')).summary, { matched: 0, existing: 0, parsed: 0, skipped: 0, skipReasons: {} })
  pass('sync distinguishes no matches, existing imports and rejected content without returning raw mail')
  if (process.argv.includes('--browser')) {
    process.chdir(path.join(ROOT, 'frontend')) // Tailwind resolves content/config relative to the app.
    const { createServer } = await import('vite')
    vite = await createServer({ root: path.join(ROOT, 'frontend'), envDir: __dirname, server: { host: '127.0.0.1', port: 5176, strictPort: true } }); await vite.listen()
    browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await context.addInitScript(({ token, user }) => { localStorage.setItem('flo_token', token); localStorage.setItem('flo_user', JSON.stringify(user)); if (!localStorage.getItem('flo_lang')) localStorage.setItem('flo_lang', 'th'); if (!localStorage.getItem('flo_theme')) localStorage.setItem('flo_theme', 'dark') }, a)
    page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message))
    clearThrottle(); await page.goto(WEB + '/settings')
    const card = page.locator('#settings-bank-mail')
    await expect(card.getByText('alpha@gmail.test')).toBeVisible()
    await card.getByLabel('หมวดรายจ่ายเริ่มต้น').selectOption(a.settings.expenseCategoryId)
    await card.getByRole('button', { name: 'บันทึกการตั้งค่า', exact: true }).click()
    await expect(card.getByRole('status')).toHaveText('บันทึกการตั้งค่าแล้ว')
    await card.getByRole('button', { name: 'บันทึกแล้ว', exact: true }).click()
    await expect(card.locator('article')).toHaveCount(3)
    await card.getByRole('button', { name: /รอตรวจทาน/ }).click()
    await expect(card.locator('article')).toHaveCount(3)
    await page.getByRole('button', { name: /เริ่มบัญชีใหม่ทั้งหมด/ }).click()
    await expect(page.locator('#dz-confirm')).toHaveAttribute('placeholder', a.user.email)
    await expect(page.locator('#dz-confirm')).toHaveValue('')
    await expect(page.getByRole('button', { name: 'ลบถาวร', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
    await page.getByRole('button', { name: /ล้างรายการ/ }).click()
    await expect(page.locator('#dz-confirm')).toHaveAttribute('placeholder', 'ลบรายการทั้งหมด')
    await expect(page.getByRole('button', { name: 'ลบถาวร', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
    const out = path.join(ROOT, 'frontend/.smoke/ux-artifacts/bank-mail'); await fs.mkdir(out, { recursive: true })
    for (const [theme, width] of [['dark', 390], ['light', 1440]]) {
      await page.evaluate(theme => { localStorage.setItem('flo_theme', theme) }, theme)
      await page.setViewportSize({ width, height: 1000 }); clearThrottle(); await page.reload()
      await expect(card.getByText('alpha@gmail.test')).toBeVisible(); await card.scrollIntoViewIfNeeded()
      assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), theme === 'dark')
      assert.equal(await page.locator('#main-content').evaluate(el => el.scrollWidth <= el.clientWidth), true)
      await page.screenshot({ path: path.join(out, `${theme}-${width}.png`) })
      await card.locator('article').first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(out, `${theme}-${width}-review.png`) })
    }
    assert.deepEqual(errors, [])
    pass('real browser settings/API, review tabs, Thai mobile/desktop, both confirmation placeholders and empty guards')
    // Exercise the OAuth redirect → frontend completion → authenticated API path.
    const start = new URL((await a.call('POST', '/bank-mail/connect')).url), oauthState = start.searchParams.get('state')
    await page.goto(`${API}/bank-mail/gmail/callback?state=${oauthState}&code=alpha`)
    await expect(card.getByRole('status')).toHaveText('เชื่อม Gmail แล้ว ตรวจการตั้งค่าก่อนเปิดบันทึกอัตโนมัติได้เลย')
    assert.equal(new URL(page.url()).hash, ''); assert.equal(new URL(page.url()).search, '')
    pass('OAuth callback completes only with the initiating user JWT and clears code/state from the URL')

    const billContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await billContext.addInitScript(({ token, user }) => {
      localStorage.setItem('flo_token', token); localStorage.setItem('flo_user', JSON.stringify(user)); localStorage.setItem('flo_lang', 'th')
    }, c)
    const billPage = await billContext.newPage(), billCard = billPage.locator('#settings-bank-mail')
    const billErrors = []; billPage.on('pageerror', err => billErrors.push(err.message))
    clearThrottle(); await billPage.goto(WEB + '/settings')
    await expect(billCard.getByText('charlie@gmail.test')).toBeVisible()
    await billCard.getByRole('button', { name: 'ตรวจเมลตอนนี้', exact: true }).click()
    const summary = billCard.getByRole('status', { name: 'ผลตรวจรอบนี้', exact: true })
    await expect(summary).toContainText('ไม่พบเมลที่ตรงกับผู้ส่ง')
    mailboxes.set('charlie', [malformed]); clearThrottle()
    await billCard.getByRole('button', { name: 'ตรวจเมลตอนนี้', exact: true }).click()
    await expect(summary).toContainText('ข้อมูลธุรกรรมไม่ครบหรือไม่ชัดเจน: 1')
    mailboxes.set('charlie', [newBill, billMessage('c5', 50)]); clearThrottle()
    await billCard.getByRole('button', { name: 'ตรวจเมลตอนนี้', exact: true }).click()
    await expect(summary).toContainText('รายการอาจอยู่ในรอตรวจทานหรือบันทึกแล้ว')
    await billCard.getByRole('button', { name: 'บันทึกแล้ว', exact: true }).click()
    await expect(billCard.locator('article')).toHaveCount(2)
    await expect(billCard.getByText('จ่ายบิล', { exact: true })).toHaveCount(2)
    const normalRefresh = gmail.refresh
    gmail.refresh = async token => { if (token === 'refresh:charlie') throw new GmailFailure('reconnect_required'); return normalRefresh(token) }
    clearThrottle()
    await billCard.getByRole('button', { name: 'ตรวจเมลตอนนี้', exact: true }).click()
    await expect(billCard.getByRole('alert')).toHaveText('สิทธิ์ Google หมดอายุหรือถูกถอน กรุณาเชื่อม Gmail ใหม่')
    await expect(billCard.getByRole('button', { name: 'เชื่อม Gmail ใหม่', exact: true })).toBeVisible()
    gmail.refresh = normalRefresh
    assert.deepEqual(billErrors, [])
    await billContext.close()
    pass('browser explains empty/rejected checks, displays recorded bills and immediately offers reconnect on expired access')
  }
  clearThrottle()
  const previousSaved = (await a.call('GET', '/bank-mail/entries?status=saved')).total
  await a.call('POST', '/account/reset-transactions', { confirm: 'ลบรายการทั้งหมด' })
  await a.call('POST', '/bank-mail/sync')
  assert.equal(Number((await db.query('SELECT count(*) FROM expenses WHERE user_id=$1', [a.user.id]))[0].count), 0)
  assert.equal((await a.call('GET', '/bank-mail/entries?status=saved')).total, previousSaved)
  assert.ok((await a.call('GET', '/bank-mail/entries?status=saved')).rows.every(row => row.expenseId === null))
  pass('clearing the ledger retains mail deduplication and does not resurrect deleted transactions')
  await a.call('POST', '/account/factory-reset', { confirm: a.user.email, lang: 'th' })
  assert.equal((await a.call('GET', '/bank-mail/status')).connected, false)
  assert.equal((await a.call('GET', '/bank-mail/entries')).total, 0)
  assert.equal((await b.call('GET', '/bank-mail/status')).connected, true)
  pass('factory reset removes this user connection/imports and leaves the other user intact')
  const configuredKey = process.env.BANK_MAIL_ENCRYPTION_KEY
  delete process.env.BANK_MAIL_ENCRYPTION_KEY
  assert.equal((await a.call('GET', '/bank-mail/status')).configured, false)
  await a.call('POST', '/bank-mail/connect', {}, 503)
  assert.equal((await a.call('GET', '/auth/me')).id, a.user.id)
  process.env.BANK_MAIL_ENCRYPTION_KEY = configuredKey
  pass('missing Gmail configuration disables only mail connection, not the application')
  console.log(`${checks.length} bank-mail integration checks passed (Google stubbed; real DB/API${browser ? '/browser' : ''})`)
}
run().catch(e => { console.error(e); process.exitCode = 1 }).finally(async () => {
  if (browser) await browser.close(); if (vite) await vite.close(); if (app) await app.close(); if (db?.isInitialized) await db.destroy()
})
