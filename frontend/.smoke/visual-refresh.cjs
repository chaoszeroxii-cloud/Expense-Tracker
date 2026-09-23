// Real API/Postgres + browser checks for stable loading and the shared visual system.
// Disposable DB only: moneyflow_visual_test on 127.0.0.1:15435.
// Start Vite on 5175 with VITE_API_URL=http://127.0.0.1:3096, then run this file.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { chromium, expect } = require('playwright/test')
const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(__dirname, 'ux-artifacts/visual-refresh')
const WEB = 'http://127.0.0.1:5175'
const API = 'http://127.0.0.1:3096/api'
process.chdir(path.join(ROOT, 'backend/.e2e'))
for (const key of Object.keys(process.env)) {
  if (/DATABASE_URL|GOOGLE_CLIENT_ID|FACEBOOK_APP_|BREVO_|TAVILY_|OPENROUTER_|VAPID_|CRON_SECRET/.test(key)) delete process.env[key]
}
Object.assign(process.env, { NODE_ENV: 'test', TRUST_PROXY_HOPS: '0', DB_HOST: '127.0.0.1',
  DB_PORT: '15435', DB_USER: 'expense_user', DB_PASSWORD: 'visual-local-only', DB_NAME: 'moneyflow_visual_test',
  JWT_SECRET: 'visual-regression-only-not-a-production-secret', CORS_ORIGIN: WEB })
require('reflect-metadata')
const { NestFactory } = require('@nestjs/core')
const { DataSource } = require('typeorm')
const { AppModule } = require(path.join(ROOT, 'backend/dist/app.module'))
const { databaseConfig } = require(path.join(ROOT, 'backend/dist/config/database.config'))
const { configureApp } = require(path.join(ROOT, 'backend/dist/config/configure-app'))
let app, browser, page
const checks = []
function pass(name) { checks.push(name); console.log('PASS', name) }
async function api(method, route, data, token) {
  const response = await fetch(API + route, { method, headers: { 'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) })
  assert.ok(response.ok, `${method} ${route}: ${response.status}`)
  return response.json()
}
async function settled() {
  await expect(page.locator('#main-content .skeleton')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
}
async function hold(pattern) {
  let release, hit
  const gate = new Promise(resolve => { release = resolve })
  const entered = new Promise(resolve => { hit = resolve })
  const pending = new Set()
  const handler = route => {
    const task = (async () => { hit(); await gate; await route.continue() })()
    pending.add(task)
    return task.finally(() => pending.delete(task))
  }
  await page.route(pattern, handler)
  return { entered, release: async () => {
    release(); await Promise.all([...pending]); await page.unroute(pattern, handler)
  } }
}
async function equalBottoms(selector) {
  const bottoms = await page.locator(selector).evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().bottom))
  assert.equal(bottoms.length, 2)
  assert.ok(Math.abs(bottoms[0] - bottoms[1]) < 1, `Uneven bottoms: ${bottoms}`)
}
async function run() {
  await fs.mkdir(OUT, { recursive: true })
  const db = new DataSource(databaseConfig())
  await db.initialize()
  assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'moneyflow_visual_test')
  await db.runMigrations()
  await db.destroy()
  app = await NestFactory.create(AppModule, { logger: false, bodyParser: false })
  configureApp(app)
  await app.listen(3096, '127.0.0.1')
  const account = await api('POST', '/auth/register', { email: `visual-${Date.now()}@test.local`, name: 'มิน', password: 'visual-fixture-123', lang: 'th' })
  const token = account.accessToken
  const call = (method, route, body) => api(method, route, body, token)
  await call('POST', '/auth/onboarding', { trackingMode: 'plan', monthlySpendingLimit: 24000, timezone: 'Asia/Bangkok', lang: 'th' })
  await call('PATCH', '/auth/preferences', { showWorkTime: true, expectedMonthlyIncome: 36000 })
  const user = await call('GET', '/auth/me')
  const cats = await call('GET', '/categories')
  const cat = cats.find(c => c.type === 'expense')
  for (const [note, amount] of [['กาแฟเช้าวันใหม่', 85], ['เดินทางกลับบ้าน', 120], ['ซื้อของเข้าบ้าน', 340]]) {
    await call('POST', '/expenses', { type: 'expense', amount, categoryId: cat.id, note, occurredAt: new Date().toISOString() })
  }
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Bangkok' })
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('flo_token', token); localStorage.setItem('flo_user', JSON.stringify(user))
    localStorage.setItem('flo_lang', 'en'); localStorage.setItem('flo_theme', 'light')
  }, { token, user })
  page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(WEB + '/budget'); await settled()
  await equalBottoms('[data-planning-grid] > section')
  const addButtons = page.locator('[data-planning-grid] > section > button:last-child')
  const positions = await addButtons.evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().bottom))
  assert.ok(Math.abs(positions[0] - positions[1]) < 1)
  pass('empty planning cards and their bottom actions align')

  const bill = await call('POST', '/planning/bills', { name: 'ค่าเช่าบ้าน', amount: 6500, categoryId: cat.id, dueDay: 28 })
  await call('POST', '/planning/goals', { name: 'พักใจที่เชียงใหม่', targetAmount: 18000, savedAmount: 6200, targetDate: '2027-03-01' })
  await page.reload(); await settled()
  await equalBottoms('[data-planning-grid] > section')
  pass('populated planning cards align despite different content heights')

  await page.getByRole('button', { name: 'Edit พักใจที่เชียงใหม่', exact: true }).click()
  const goalName = page.getByLabel('What are you saving for?', { exact: true })
  await goalName.fill('draft kept during refresh')
  await goalName.evaluate(el => { window.__goalInput = el })
  const planDelay = await hold('**/api/budgets/plan?*')
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('moneyflow:refresh', { detail: { types: ['transactions'] } })))
  await planDelay.entered
  await page.waitForTimeout(300)
  await expect(goalName).toHaveValue('draft kept during refresh')
  assert.equal(await goalName.evaluate(el => el === window.__goalInput), true)
  await planDelay.release()
  await page.locator('form').getByRole('button', { name: 'Cancel', exact: true }).click()
  pass('background plan refresh retains mounted cards and an unsaved goal draft')

  await page.goto(WEB + '/'); await settled()
  await equalBottoms('[data-home-detail-grid] > *')
  const badgeBelowAmount = await page.locator('[data-home-detail-grid] li').first().evaluate(el => {
    const amount = el.querySelector('.text-expense')
    const badge = el.querySelector('.tabular-nums')
    return !badge || badge.getBoundingClientRect().top >= amount.getBoundingClientRect().bottom
  })
  assert.equal(badgeBelowAmount, true)
  pass('home card bottoms align and work-time caption stays below its amount')
  await page.locator('.daily-hero').evaluate(el => { window.__hero = el })
  const homeDelay = await hold('**/api/analytics/daily-brief')
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('moneyflow:refresh', { detail: { types: ['dashboard'] } })))
  await homeDelay.entered
  await page.waitForTimeout(350)
  await expect(page.locator('#main-content .skeleton')).toHaveCount(0)
  assert.equal(await page.locator('.daily-hero').evaluate(el => el === window.__hero), true)
  await homeDelay.release(); await settled()
  pass('slow background refresh does not replace content with skeletons')

  const initialDelay = await hold('**/api/analytics/daily-brief')
  await page.reload(); await initialDelay.entered
  await page.waitForTimeout(450)
  const skeleton = page.locator('[data-skeleton]').first()
  const style = await skeleton.evaluate(el => ({ opacity: getComputedStyle(el).opacity, iterations: getComputedStyle(el).animationIterationCount }))
  assert.equal(style.opacity, '1'); assert.equal(style.iterations, '1')
  await page.waitForTimeout(500)
  assert.equal(await skeleton.evaluate(el => getComputedStyle(el).opacity), '1')
  await page.screenshot({ path: path.join(OUT, 'loading.png') })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await skeleton.evaluate(el => getComputedStyle(el).animationName), 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await initialDelay.release(); await settled()
  pass('initial loading holds geometry, does not pulse, and respects reduced motion')

  await page.goto(WEB + '/history'); await settled()
  const current = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).slice(0, 7)
  const date = new Date(current + '-15T12:00:00Z'); date.setUTCMonth(date.getUTCMonth() - 1)
  const previous = date.toISOString().slice(0, 7)
  const previousDelay = await hold(url => url.pathname === '/api/expenses' && url.searchParams.get('month') === previous)
  await page.getByRole('button', { name: 'Previous month', exact: true }).click(); await previousDelay.entered
  await expect(page.getByText('กาแฟเช้าวันใหม่', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  await expect(page.getByText('กาแฟเช้าวันใหม่', { exact: true })).toBeVisible()
  await previousDelay.release(); await settled()
  await expect(page.getByText('กาแฟเช้าวันใหม่', { exact: true })).toBeVisible()
  pass('month changes hide old data immediately and ignore a late previous-month response')

  for (const [screen, route] of [['home', '/'], ['plan', '/budget'], ['history', '/history']]) {
    await page.goto(WEB + route); await settled()
    await page.evaluate(async () => (await import('/src/store/i18n.store.ts')).useI18n.getState().setLang('th'))
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async theme => (await import('/src/store/theme.store.ts')).useThemeStore.getState().setTheme(theme), theme)
      await page.waitForTimeout(220)
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.screenshot({ path: path.join(OUT, `${screen}-${theme}-desktop.png`) })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.screenshot({ path: path.join(OUT, `${screen}-${theme}-mobile.png`) })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      assert.equal(await page.locator('#main-content').evaluate(el => el.scrollWidth <= el.clientWidth), true)
    }
  }
  pass('Thai home, history and plan fit desktop/mobile in both themes')

  const iconPage = await context.newPage()
  await iconPage.route('**/__icon-preview__', route => route.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><html><body></body></html>' }))
  await iconPage.goto(WEB + '/__icon-preview__')
  await iconPage.setContent(`<body style="margin:0;padding:32px;background:#eef1f4;display:flex;gap:24px;align-items:center"><img width="192" src="${WEB}/app_icon.svg"><img width="96" src="${WEB}/icon.svg"><img width="48" src="${WEB}/icons/icon-192.png"><img width="32" src="${WEB}/app_icon.svg"><img width="16" src="${WEB}/app_icon.svg"></body>`)
  await iconPage.locator('img').first().evaluate(el => el.decode())
  for (const [file, size, alpha] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['apple-touch-icon.png', 180, 0], ['icon-maskable-512.png', 512, 255]]) {
    const actual = await iconPage.evaluate(async ({ url }) => {
      const img = new Image(); img.src = url; await img.decode()
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
      return { width: img.width, height: img.height, alpha: ctx.getImageData(0, 0, 1, 1).data[3] }
    }, { url: WEB + '/icons/' + file })
    assert.deepEqual(actual, { width: size, height: size, alpha })
  }
  await iconPage.screenshot({ path: path.join(OUT, 'logos.png') }); await iconPage.close()
  pass('all PWA icons decode at the required size with correct transparent/maskable corners')
  assert.deepEqual(errors, [])
  pass('no browser runtime exceptions')
  if (process.argv.includes('--with-flows')) {
    for (const script of ['planning-flow.cjs', 'daily-flow.cjs']) await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, script)], { cwd: ROOT,
        env: { ...process.env, UX_API_URL: API, UX_WEB_URL: WEB }, stdio: 'inherit', windowsHide: true })
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${script}: ${code}`)))
    })
  }
  await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify({ checks: checks.length, results: checks }, null, 2))
  console.log(`${checks.length} visual/loading checks passed`)
}
run().catch(async error => {
  console.error(error); process.exitCode = 1
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {})
}).finally(async () => { if (browser) await browser.close(); if (app) await app.close() })
