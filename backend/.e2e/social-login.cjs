// Real Nest API + disposable Postgres + browser. Only provider SDK/HTTP calls are
// stubbed: no credentials or real Google/Facebook accounts. See docs/social-login.md.
const assert = require('node:assert/strict')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '../..')
const WEB = 'https://moneyflow.test', LOCAL = 'http://127.0.0.1:5177', API = 'http://127.0.0.1:3094/api'
process.chdir(__dirname) // Do not load the developer's .env.
for (const key of Object.keys(process.env)) {
  if (/DATABASE_URL|GOOGLE_|FACEBOOK_|BREVO_|TAVILY_|OPENROUTER_|VAPID_|GMAIL_|CRON_SECRET|BANK_MAIL_/.test(key)) delete process.env[key]
}
Object.assign(process.env, {
  NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: '15437', DB_NAME: 'moneyflow_social_test',
  DB_USER: 'expense_user', DB_PASSWORD: 'social-local-only', JWT_SECRET: 'social-test-only-not-for-production',
  CORS_ORIGIN: WEB, FRONTEND_URL: WEB, TRUST_PROXY_HOPS: '0',
  VITE_API_URL: '', VITE_GOOGLE_CLIENT_ID: 'social-test-google', VITE_FACEBOOK_APP_ID: 'social-test-facebook',
})
require('reflect-metadata')
const { NestFactory } = require('@nestjs/core'), { DataSource } = require('typeorm')
const { AppModule } = require('../dist/app.module')
const { databaseConfig } = require('../dist/config/database.config')
const { configureApp } = require('../dist/config/configure-app')
const { chromium, expect } = require('playwright/test')
const axios = require('axios')
const runId = Date.now(), localEmail = `social-local-${runId}@test.local`
const providerCalls = []
axios.get = async (url, options) => {
  providerCalls.push(url)
  const token = options.params?.access_token ?? options.headers?.Authorization?.replace('Bearer ', '')
  if (url === 'https://oauth2.googleapis.com/tokeninfo') {
    return { data: { aud: token === 'wrong-app' ? 'another-app' : 'social-test-google' } }
  }
  if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') {
    return { data: { sub: `google-${token}-${runId}`, name: 'Google Test', email_verified: true,
      email: token === 'collision' ? localEmail : `google-${runId}@test.local` } }
  }
  if (url === 'https://graph.facebook.com/debug_token') {
    return { data: { data: { is_valid: true, app_id: options.params.input_token === 'wrong-app' ? 'another-app' : 'social-test-facebook' } } }
  }
  if (url === 'https://graph.facebook.com/me') {
    return { data: { id: `facebook-${runId}`, name: 'Facebook Test',
      ...(token === 'no-email' ? {} : { email: `facebook-${runId}@test.local` }) } }
  }
  throw new Error('Unexpected external HTTP in social-login regression')
}
axios.post = async () => { throw new Error('External HTTP disabled in social-login regression') }

let db, app, vite, browser, clearThrottle, checks = 0
const pass = name => { checks++; console.log('PASS', name) }
async function request(endpoint, body, token) {
  const res = await fetch(API + endpoint, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, body: await res.json() }
}
async function run() {
  db = new DataSource(databaseConfig()); await db.initialize()
  assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'moneyflow_social_test')
  await db.runMigrations()
  app = await NestFactory.create(AppModule, { logger: false, bodyParser: false })
  configureApp(app); await app.listen(3094, '127.0.0.1')
  clearThrottle = () => app.get(require('@nestjs/throttler').getStorageToken()).storage.clear()
  const local = await request('/auth/register', { email: localEmail, name: 'Local Test', password: 'local-test-password' })
  assert.equal(local.status, 201)
  process.chdir(path.join(ROOT, 'frontend')) // Tailwind resolves config relative to the app.
  const { createServer } = await import('vite')
  vite = await createServer({ root: path.join(ROOT, 'frontend'), envDir: __dirname,
    server: { host: '127.0.0.1', port: 5177, strictPort: true, hmr: false,
      proxy: { '/api': { target: 'http://127.0.0.1:3094', changeOrigin: true } } } })
  await vite.listen()
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  // HTTPS test origin for Facebook's browser check; requests still go only to our
  // local Vite/Nest servers. This does not claim to test the actual provider popup.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === WEB) return route.fulfill({ response: await route.fetch({ url: LOCAL + url.pathname + url.search }) })
    if (url.hostname === 'accounts.google.com' && url.pathname === '/gsi/client') {
      return route.fulfill({ contentType: 'application/javascript', body: `window.google = { accounts: { oauth2: {
        initTokenClient: options => { window.googleReady = true; return {
          requestAccessToken: () => options.callback({ access_token: window.testProviderToken || 'verified' })
        } }
      } } };` })
    }
    if (url.hostname === 'connect.facebook.net') return route.fulfill({ contentType: 'application/javascript', body: `
      window.FB = { init: () => {}, login: cb => cb({ authResponse: { accessToken: window.testProviderToken || 'verified' } }) };
      window.fbAsyncInit?.();` })
    return route.abort() // No external SDK, fonts, telemetry, or account traffic.
  })
  await context.addInitScript(() => localStorage.setItem('flo_lang', 'th'))
  const page = await context.newPage(), pageErrors = []
  page.on('pageerror', err => pageErrors.push(err.message))
  let navigations = 0
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
  async function openLogin() {
    clearThrottle()
    await page.goto(WEB + '/login')
    try {
      await page.waitForFunction(() => window.googleReady && window.FB)
    } catch (error) {
      console.error('Boot diagnostics', { pageErrors, text: (await page.locator('body').innerText()).slice(0, 700),
        sdk: await page.evaluate(() => ({ google: !!window.google, ready: !!window.googleReady, facebook: !!window.FB })) })
      throw error
    }
  }
  async function social(provider, expectedStatus) {
    clearThrottle()
    const response = page.waitForResponse(r => r.url().endsWith(`/api/auth/${provider}/verify`))
    await page.getByRole('button', { name: provider === 'google' ? /Google/ : /Facebook/, exact: false }).click()
    assert.equal((await response).status(), expectedStatus)
  }
  await openLogin()
  await page.locator('input[type=email]').fill(localEmail)
  const initialNavigations = navigations
  for (const provider of ['google', 'facebook']) {
    await social(provider, 401)
    await expect(page.getByRole('alert')).toContainText(`เซิร์ฟเวอร์ยังตั้งค่าการเข้าสู่ระบบด้วย ${provider === 'google' ? 'Google' : 'Facebook'} ไม่ครบ`)
    await expect(page.locator('input[type=email]')).toHaveValue(localEmail)
    assert.equal(navigations, initialNavigations)
  }
  assert.equal(providerCalls.length, 0)
  pass('unconfigured providers return real API errors, shown in Thai without reload or form loss')

  await page.locator('input[type=password]').fill('incorrect-password')
  await page.locator('form button[type=submit]').click()
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials')
  await expect(page.locator('input[type=email]')).toHaveValue(localEmail)
  assert.equal(navigations, initialNavigations)
  pass('incorrect email/password stays on the form with the API error')

  // A failed public sign-in must not clear an already stored session either.
  await page.evaluate(async auth => {
    const { useAuthStore } = await import('/src/store/auth.store.ts')
    useAuthStore.getState().setAuth(auth.accessToken, auth.user)
  }, local.body)
  await social('google', 401)
  assert.equal(await page.evaluate(() => localStorage.getItem('flo_token')), local.body.accessToken)
  pass('a public auth failure does not clear an existing session')
  await page.evaluate(async () => (await import('/src/store/auth.store.ts')).useAuthStore.getState().clearAuth())

  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'social-test-google', FACEBOOK_APP_ID: 'social-test-facebook', FACEBOOK_APP_SECRET: 'test-only' })
  await page.evaluate(() => { window.testProviderToken = 'wrong-app' })
  for (const provider of ['google', 'facebook']) {
    await social(provider, 401)
    await expect(page.getByRole('alert')).toContainText('แจ้งผู้ดูแลแอปให้ตรวจสอบการตั้งค่าล็อกอิน')
  }
  pass('tokens for another app are rejected with actionable guidance for both providers')
  await page.evaluate(() => { window.testProviderToken = 'collision' })
  await social('google', 409)
  await expect(page.getByRole('alert')).toContainText('กรุณาใช้วิธีเดิม')
  assert.deepEqual((await db.query('SELECT google_id,facebook_id FROM users WHERE id=$1', [local.body.user.id]))[0], { google_id: null, facebook_id: null })
  pass('matching email keeps account-linking protection and explains the original sign-in method')
  await page.evaluate(() => { window.testProviderToken = 'no-email' })
  await social('facebook', 400)
  await expect(page.getByRole('alert')).toContainText('ไม่ได้ส่งอีเมลที่ยืนยันแล้ว')
  pass('missing provider email is explained and cannot create an account')

  for (const provider of ['google', 'facebook']) {
    await page.evaluate(() => { window.testProviderToken = 'verified' })
    await social(provider, 200)
    await expect(page).toHaveURL(WEB + '/onboarding')
    const stored = await page.evaluate(() => ({ token: localStorage.getItem('flo_token'), user: JSON.parse(localStorage.getItem('flo_user')) }))
    assert.equal((await request('/auth/me', undefined, stored.token)).body.id, stored.user.id)
    const again = await request(`/auth/${provider}/verify`, provider === 'google' ? { token: 'verified' } : { accessToken: 'verified' })
    assert.equal(again.status, 200); assert.equal(again.body.user.id, stored.user.id)
    await openLogin()
    await page.evaluate(async () => (await import('/src/store/auth.store.ts')).useAuthStore.getState().clearAuth())
    pass(`${provider}: configured new and returning login issue valid sessions and navigate to onboarding`)
  }

  // Unlike the public routes, /auth/me must still clear an expired session.
  const reloaded = page.waitForEvent('load')
  await page.evaluate(async user => {
    const { useAuthStore } = await import('/src/store/auth.store.ts')
    useAuthStore.getState().setAuth('expired-test-token', user)
    const { authApi } = await import('/src/api/index.ts')
    void authApi.me().catch(() => {})
  }, local.body.user)
  await reloaded
  await expect(page).toHaveURL(WEB + '/login')
  assert.equal(await page.evaluate(() => localStorage.getItem('flo_token')), null)
  pass('protected /auth/me 401 still clears the session and redirects to login')
  assert.deepEqual(pageErrors, [])
  console.log(`${checks} social-login integration checks passed (provider SDK/HTTP stubbed; real DB/API/browser)`)
}
run().catch(err => { console.error(err); process.exitCode = 1 }).finally(async () => {
  if (browser) await browser.close()
  if (vite) await vite.close()
  if (app) await app.close()
  if (db?.isInitialized) {
    await db.query("DELETE FROM users WHERE email = $1 OR email = $2 OR email = $3", [localEmail, `google-${runId}@test.local`, `facebook-${runId}@test.local`])
    await db.destroy()
  }
})
