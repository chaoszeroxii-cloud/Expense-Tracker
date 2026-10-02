// Browser UI contract tests: native Android/iOS installers are not emulated here.
// Run after npm run build --workspace frontend. No real account or API is used.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { chromium, devices } = require('playwright')

const dist = path.resolve(__dirname, '../dist')
const artifacts = path.join(__dirname, 'ux-artifacts', 'pwa-install')
const routes = new Map(require('../vercel.json').rewrites.map(rule => [rule.source, rule.destination]))
const checks = []
function pass(name) { checks.push(name); console.log('PASS:', name) }
const user = { id: 'install-test', name: 'Install test', email: 'install@example.test', role: 'user', onboardingCompleted: true, currency: 'THB', hasPassword: true, expectedMonthlyIncome: null, trackingMode: 'track_only', monthlySpendingLimit: null, timezone: 'Asia/Bangkok', advancedMode: false, workHoursPerDay: 8, workDaysPerMonth: 22, showWorkTime: false }

async function main() {
  fs.mkdirSync(artifacts, { recursive: true })
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : routes.get(pathname) ?? pathname))
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); return res.end('Not found')
    }
    const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(file)]
    res.writeHead(200, { 'Content-Type': type ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch()
  const errors = []
  const writes = []
  async function open(options = {}) {
    const context = await browser.newContext({ ...devices['Pixel 7'], ...options.device, serviceWorkers: 'block' })
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.pathname.includes('/api/')) {
        if (route.request().method() !== 'GET') writes.push(url.pathname)
        const body = url.pathname.endsWith('/auth/me') ? user : url.pathname.endsWith('/categories') ? [] : {}
        return route.fulfill({ json: body })
      }
      if (url.origin !== base || url.pathname.startsWith('/_vercel/')) return route.abort()
      return route.continue()
    })
    await context.addInitScript(({ early, lang, dark, standalone, ipad, insecure, signedIn, user }) => {
      localStorage.setItem('flo_lang', lang ?? 'en')
      localStorage.setItem('flo_theme', dark ? 'dark' : 'light')
      if (signedIn) { localStorage.setItem('flo_token', 'synthetic-install-token'); localStorage.setItem('flo_user', JSON.stringify(user)) }
      if (standalone) Object.defineProperty(navigator, 'standalone', { value: true })
      if (ipad) { Object.defineProperty(navigator, 'platform', { value: 'MacIntel' }); Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 }) }
      if (insecure) Object.defineProperty(window, 'isSecureContext', { value: false })
      window.installTest = { calls: 0, gestures: [], prevented: false }
      window.emitInstall = (outcome = 'pending') => {
        const event = new Event('beforeinstallprompt', { cancelable: true })
        let settle
        event.userChoice = new Promise(resolve => { settle = resolve })
        window.finishInstall = result => settle({ outcome: result })
        event.prompt = async () => {
          window.installTest.calls++
          window.installTest.gestures.push(navigator.userActivation.isActive)
          if (outcome === 'throw') throw new Error('Synthetic installer failure')
          if (outcome !== 'pending') settle({ outcome })
        }
        window.dispatchEvent(event)
        window.installTest.prevented = event.defaultPrevented
      }
      if (early) {
        const add = window.addEventListener
        window.addEventListener = function (type, listener, options) {
          add.call(this, type, listener, options)
          if (type === 'beforeinstallprompt') {
            window.addEventListener = add
            // Delivered as the handler registers, before React renders either route.
            window.emitInstall()
          }
        }
      }
    }, { ...options, user })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(base + (options.signedIn ? '/settings' : '/login'))
    const card = page.getByTestId('install-app')
    if (!options.standalone) await card.waitFor()
    const button = card.locator('button.primary-action')
    return { context, page, card, button }
  }
  try {
    const manifest = await (await fetch(base + '/manifest.webmanifest')).json()
    assert.equal(manifest.id, '/')
    assert.equal(manifest.start_url, '/')
    assert.equal(manifest.display, 'standalone')
    for (const icon of manifest.icons) {
      const response = await fetch(base + icon.src)
      assert.equal(response.status, 200)
      const png = Buffer.from(await response.arrayBuffer())
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
      assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes)
    }
    pass('Manifest retains the existing app identity and valid PNG dimensions')

    {
      const { context, page, card, button } = await open({ early: true })
      await page.locator('input[type=email]').fill('keep@example.test')
      await button.click()
      assert(await button.isDisabled())
      assert.deepEqual(await page.evaluate(() => window.installTest), { calls: 1, gestures: [true], prevented: true })
      await page.evaluate(() => window.finishInstall('dismissed'))
      await card.getByText('You can install later from the browser menu, or use this page as usual.').waitFor()
      await button.click()
      assert.equal(await page.evaluate(() => window.installTest.calls), 1)
      assert(await card.getByRole('list').isVisible())
      assert.equal(await page.locator('input[type=email]').inputValue(), 'keep@example.test')
      pass('Early prompt is captured; direct user gesture prompts once; dismissal preserves form input and offers instructions')
      await page.evaluate(() => window.emitInstall('accepted'))
      await button.click()
      await card.getByText(/cannot verify installation/).waitFor()
      assert(await card.isVisible())
      await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
      await card.waitFor({ state: 'hidden' })
      pass('Prompt acceptance does not claim OS success; browser appinstalled event hides the promotion')
      await context.close()
    }

    {
      const { context, page, card, button } = await open({ lang: 'th', dark: true })
      await page.evaluate(() => window.emitInstall('throw'))
      await button.click()
      await card.getByText(/เปิดหน้าต่างติดตั้งไม่ได้/).waitFor()
      assert(await card.getByRole('list').isVisible())
      assert.equal(await page.evaluate(() => window.installTest.calls), 1)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await card.screenshot({ path: path.join(artifacts, 'android-th-dark.png') })
      pass('Prompt failure gives Thai manual instructions, stays usable and fits a mobile screen')
      await context.close()
    }

    {
      const { context, page, card, button } = await open()
      await button.focus()
      await page.keyboard.press('Enter')
      assert(await card.getByRole('button', { name: 'Android', exact: true }).getAttribute('aria-pressed') === 'true')
      assert.match(await card.getByRole('list').innerText(), /three-dot menu/)
      await card.getByRole('button', { name: 'iPhone / iPad', exact: true }).click()
      assert.match(await card.getByRole('list').innerText(), /Share/)
      assert.equal(await page.evaluate(() => window.installTest.calls), 0)
      pass('No prompt still provides keyboard-accessible Android and iOS instructions')
      await context.close()
    }

    {
      const { context, page, card, button } = await open({ device: { ...devices['iPhone 13'], userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0.7339.39 Mobile/15E148 Safari/604.1' } })
      assert.equal(await button.innerText(), 'Add to Home Screen')
      await button.click()
      assert.match(await card.getByRole('list').innerText(), /Safari or Chrome/)
      assert.match(await card.getByRole('list').innerText(), /Share/)
      assert.equal(await page.evaluate(() => window.installTest.calls), 0)
      await card.screenshot({ path: path.join(artifacts, 'ios-en-light.png') })
      pass('Chrome on iPhone receives Share → Add to Home Screen guidance without a fake native prompt')
      await context.close()
    }

    {
      const { context, button } = await open({ ipad: true, device: { ...devices['Desktop Safari'], viewport: { width: 768, height: 1024 } } })
      assert.equal(await button.innerText(), 'Add to Home Screen')
      pass('iPad desktop user agent is recognized through MacIntel + touch support')
      await context.close()
    }

    {
      const { context, page, card } = await open({ standalone: true })
      await page.locator('form button[type=submit]').waitFor()
      assert.equal(await card.count(), 0)
      pass('The installed standalone experience does not promote installing itself')
      await context.close()
    }

    {
      const { context, page, card, button } = await open({ early: true })
      await context.setOffline(true)
      await card.getByText(/Connect to the internet/).waitFor()
      await button.click()
      assert.equal(await page.evaluate(() => window.installTest.calls), 0)
      await context.setOffline(false)
      await page.waitForFunction(() => navigator.onLine)
      await button.click()
      assert.equal(await page.evaluate(() => window.installTest.calls), 1)
      await page.evaluate(() => window.finishInstall('dismissed'))
      pass('Offline help does not consume the prompt; reconnecting can still use it')
      await context.close()
    }

    {
      const { context, page, card, button } = await open({ early: true, insecure: true })
      await button.click()
      assert.match(await card.locator('[role=status]').innerText(), /HTTPS/)
      assert.equal(await page.evaluate(() => window.installTest.calls), 0)
      pass('Insecure origins explain the HTTPS requirement rather than attempting installation')
      await context.close()
    }

    {
      const { context, page, button } = await open({ early: true, signedIn: true })
      await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
      await button.click()
      assert.equal(await page.evaluate(() => window.installTest.calls), 1)
      await page.evaluate(() => window.finishInstall('dismissed'))
      assert.equal(await page.evaluate(() => localStorage.getItem('flo_token')), 'synthetic-install-token')
      pass('Settings shares the early install event and preserves the signed-in session')
      await context.close()
    }
    assert.deepEqual(errors, [])
    assert.deepEqual(writes, [])
    pass('No page exceptions or API writes during any installation flow')
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ passed: checks.length, checks, nativeInstallerVerified: false }, null, 2))
    console.log(`PWA INSTALL: ${checks.length} checks passed (native OS installation not exercised)`)
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
