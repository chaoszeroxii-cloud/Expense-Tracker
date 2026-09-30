// Real production builds + real service workers, served as two successive deployments.
// All data is synthetic and local. No backend or Vercel account is required.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { execFileSync } = require('node:child_process')
const { chromium } = require('playwright')

const frontend = path.resolve(__dirname, '..')
const artifacts = path.join(__dirname, 'ux-artifacts', 'deploy-recovery')
const config = require('../vercel.json')
const rewrites = new Map(config.rewrites.map(rule => [rule.source, rule.destination]))
const checks = []
function pass(name) { checks.push(name); console.log('PASS:', name) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function build(release) {
  const out = path.join(artifacts, release)
  const env = { ...process.env, APP_VERSION: release, VITE_API_URL: '/api', VITE_GOOGLE_CLIENT_ID: '', VITE_FACEBOOK_APP_ID: '' }
  delete env.VERCEL_GIT_COMMIT_SHA
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js')
  execFileSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir'], {
    cwd: frontend, env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  return out
}

async function main() {
  fs.mkdirSync(artifacts, { recursive: true })
  // Fixed paths only: new client routes must also work as direct Vercel navigations.
  const routes = [...fs.readFileSync(path.join(frontend, 'src/App.tsx'), 'utf8').matchAll(/<Route path="([^"]+)"/g)]
  for (const [, route] of routes) if (route !== '/' && route !== '*') assert.equal(rewrites.get(route), '/index.html', route)
  pass('Every current client route has a Vercel rewrite; assets/API are excluded')
  console.log('Building releases A and B…')
  const builds = { a: build('recovery-a'), b: build('recovery-b') }
  const lazyA = fs.readdirSync(path.join(builds.a, 'assets')).find(name => /^ForgotPasswordPage-.*\.js$/.test(name))
  assert(!fs.existsSync(path.join(builds.b, 'assets', lazyA)), 'Release B must remove the old ForgotPasswordPage chunk')
  let active = 'a'
  let missing = null
  let runtimeError = false
  let rejectWorkerUpdate = false
  let apiCalls = 0
  const misses = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const pathname = url.pathname
    if (pathname.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      return res.end(JSON.stringify({ synthetic: true, sequence: ++apiCalls }))
    }
    if (pathname.startsWith('/_vercel/')) { res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end('') }
    if (runtimeError && /\/ForgotPasswordPage-.*\.js$/.test(pathname)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' })
      return res.end('throw new Error("Synthetic application exception")')
    }
    if ((missing && missing.test(pathname)) || (rejectWorkerUpdate && pathname === '/sw.js')) {
      misses.push(pathname)
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('NOT_FOUND')
    }
    const route = pathname === '/' ? '/index.html' : rewrites.get(pathname) ?? pathname
    const file = path.resolve(builds[active], '.' + route)
    if (!file.startsWith(builds[active] + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      misses.push(pathname)
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('NOT_FOUND')
    }
    const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(file)] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch()

  async function newPage({ workers = true, lang = 'en', dark = false, blockStorage = false } = {}) {
    const context = await browser.newContext({ serviceWorkers: workers ? 'allow' : 'block', viewport: { width: 390, height: 844 } })
    await context.route(url => url.origin !== base, route => route.abort())
    await context.addInitScript(({ lang, dark, blockStorage }) => {
      localStorage.setItem('flo_lang', lang)
      localStorage.setItem('flo_theme', dark ? 'dark' : 'light')
      sessionStorage.setItem('test_documents', String(Number(sessionStorage.getItem('test_documents') ?? 0) + 1))
      if (blockStorage) Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError') } })
    }, { lang, dark, blockStorage })
    const page = await context.newPage()
    return { page, context }
  }
  const login = page => page.locator('form button[type="submit"]').waitFor({ state: 'visible', timeout: 15000 })
  const ready = page => page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 15000 })
  const docs = page => page.evaluate(() => Number(sessionStorage.getItem('test_documents')))
  const caches = page => page.evaluate(async () => (await Promise.all((await window.caches.keys()).map(async name => (await (await window.caches.open(name)).keys()).map(req => req.url)))).flat())

  try {
    for (const route of rewrites.keys()) assert.equal((await fetch(base + route)).status, 200)
    for (const route of ['/assets/missing.js', '/missing.js', '/icons/missing.svg']) {
      const response = await fetch(base + route)
      assert.equal(response.status, 404)
      assert(!response.headers.get('content-type').includes('html'))
    }
    pass('Direct routes serve HTML and missing static files keep their 404s')

    // On the old build AuthPage loaded before SW activation and was never cached.
    // One visit must now suffice: no second navigation to warm the runtime cache.
    {
      const { page, context } = await newPage()
      await page.goto(base + '/')
      await login(page)
      await ready(page)
      await context.setOffline(true)
      await page.goto(base + '/')
      await login(page)
      assert.equal(new URL(page.url()).pathname, '/login')
      assert.equal(await page.locator('#app-error-title').count(), 0)
      pass('First-visit app shell includes Login and opens from start_url while offline')
      await context.close()
    }

    // Login is now eager; exercise deployment recovery with an unvisited lazy route.
    {
      const { page, context } = await newPage()
      await page.goto(base + '/login')
      await login(page)
      await ready(page)
      await page.evaluate(async () => {
        localStorage.setItem('flo_token', 'synthetic-token-not-a-credential')
        localStorage.setItem('flo_capture_draft_test-user', '[{"amount":"120","note":"keep draft"}]')
        await new Promise((resolve, reject) => {
          const request = indexedDB.open('moneyflow-offline', 1)
          request.onupgradeneeded = () => {
            const store = request.result.createObjectStore('pending-expenses', { keyPath: 'id' })
            store.createIndex('userId', 'userId')
          }
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction('pending-expenses', 'readwrite')
            tx.objectStore('pending-expenses').put({ id: 'test-pending', userId: 'test-user', payload: { amount: 120 }, attempts: 0 })
            tx.oncomplete = () => { db.close(); resolve() }
          }
        })
      })
      active = 'b'
      await page.locator('a[href="/forgot-password"]').click()
      await login(page)
      await page.waitForFunction(() => sessionStorage.getItem('test_documents') === '2')
      assert(misses.includes('/assets/' + lazyA), 'Must exercise the actual old-chunk 404')
      assert.equal(new URL(page.url()).pathname, '/forgot-password')
      assert.equal(await page.evaluate(() => localStorage.getItem('flo_token')), 'synthetic-token-not-a-credential')
      assert.match(await page.evaluate(() => localStorage.getItem('flo_capture_draft_test-user')), /keep draft/)
      assert.equal(await page.evaluate(() => new Promise(resolve => {
        const request = indexedDB.open('moneyflow-offline', 1)
        request.onsuccess = () => {
          const db = request.result
          const read = db.transaction('pending-expenses').objectStore('pending-expenses').get('test-pending')
          read.onsuccess = () => { resolve(read.result.payload.amount); db.close() }
        }
      })), 120)
      pass('Real A → B deploy recovers an uncached old lazy-route chunk in one reload; token/draft/queue survive')
      await context.close()
    }

    // An ordinary worker update must not reload a healthy tab and erase typed input.
    {
      active = 'a'
      const { page, context } = await newPage()
      await page.goto(base + '/login')
      await login(page)
      await ready(page)
      await page.locator('input[type="email"]').fill('draft@example.test')
      active = 'b'
      await page.evaluate(async () => {
        const previous = navigator.serviceWorker.controller
        const registration = await navigator.serviceWorker.getRegistration()
        await registration.update()
        if (navigator.serviceWorker.controller !== previous) return
        await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
      })
      assert.equal(await page.locator('input[type="email"]').inputValue(), 'draft@example.test')
      assert.equal(await docs(page), 1)
      pass('Worker activation preserves a healthy open form without reloading it')
      await context.close()
    }

    // Even if worker update fails, the old worker must get fresh HTML on navigation.
    {
      active = 'a'
      const { page, context } = await newPage()
      await page.goto(base + '/login')
      await login(page)
      await ready(page)
      active = 'b'
      rejectWorkerUpdate = true
      await page.goto(base + '/index.html')
      await login(page)
      const entry = await page.locator('script[type="module"]').getAttribute('src')
      assert(fs.readFileSync(path.join(builds.b, 'index.html'), 'utf8').includes(entry))
      pass('Online /index.html bypasses stale precached HTML even when SW update fails')
      rejectWorkerUpdate = false
      await context.close()
    }

    // A permanently missing chunk produces an actionable screen instead of a reload loop.
    {
      active = 'b'
      missing = /\/ForgotPasswordPage-.*\.js$/
      const { page, context } = await newPage({ workers: false, lang: 'th', dark: true })
      await page.goto(base + '/forgot-password')
      await page.getByRole('button', { name: 'ลองอีกครั้ง', exact: true }).waitFor({ state: 'visible' })
      await page.waitForFunction(() => sessionStorage.getItem('test_documents') === '2')
      await delay(1200)
      assert.equal(await docs(page), 2)
      await page.getByText('รายละเอียดข้อผิดพลาด', { exact: true }).click()
      assert(await page.locator('pre').isVisible())
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(17, 22, 28)')
      await page.screenshot({ path: path.join(artifacts, 'error-th-dark.png'), fullPage: true })
      missing = null
      await page.getByRole('button', { name: 'ลองอีกครั้ง', exact: true }).click()
      await login(page)
      assert.equal(await docs(page), 3)
      pass('Permanent 404 retries once, shows readable Thai/dark details without overflow, and supports manual retry')
      await context.close()
    }

    {
      runtimeError = true
      const { page, context } = await newPage({ workers: false })
      await page.goto(base + '/forgot-password')
      await page.getByRole('heading', { name: 'The app could not open' }).waitFor()
      await delay(500)
      assert.equal(await docs(page), 1)
      assert.equal(await page.evaluate(() => sessionStorage.getItem('flo_chunk_retry')), null)
      runtimeError = false
      await page.getByRole('button', { name: 'Try again', exact: true }).click()
      await login(page)
      pass('Unrelated application errors do not trigger automatic deploy recovery')
      await context.close()
    }

    {
      missing = /\/ForgotPasswordPage-.*\.js$/
      const { page, context } = await newPage({ workers: false, blockStorage: true })
      await page.goto(base + '/forgot-password')
      await page.getByRole('button', { name: 'Try again', exact: true }).waitFor()
      await delay(500)
      assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation')[0].type), 'navigate')
      missing = null
      await page.getByRole('button', { name: 'Try again', exact: true }).click()
      await login(page)
      pass('Blocked sessionStorage disables auto retry but manual recovery remains usable')
      await context.close()
    }

    {
      const { page, context } = await newPage()
      await page.goto(base + '/login')
      await login(page)
      await ready(page)
      await page.locator('a[href="/forgot-password"]').click()
      await login(page)
      await page.waitForFunction(async () => (await caches.open('moneyflow-code-v1')).keys().then(keys => keys.some(key => /ForgotPasswordPage-/.test(key.url))))
      await page.evaluate(async () => { await fetch('/api/probe'); await fetch('/api/probe') })
      assert(apiCalls >= 2)
      assert(!(await caches(page)).some(url => new URL(url).pathname.startsWith('/api/')))
      await context.setOffline(true)
      await page.reload()
      await login(page)
      pass('Visited lazy route opens offline; API responses never enter shared caches')
      // Reset-password is still unvisited. A dotted token must not defeat the shell fallback.
      await page.goto(base + '/reset-password?token=synthetic.test.token')
      await page.getByRole('heading', { name: 'This page could not load' }).waitFor()
      assert.match(await page.getByRole('status').innerText(), /offline/)
      assert(await page.getByRole('button', { name: 'Try again', exact: true }).isDisabled())
      const before = await docs(page)
      await delay(500)
      assert.equal(await docs(page), before)
      await context.setOffline(false)
      await page.getByRole('button', { name: 'Try again', exact: true }).click()
      await login(page)
      assert.equal(new URL(page.url()).search, '?token=synthetic.test.token')
      assert(!(await caches(page)).some(url => url.includes('synthetic.test.token')))
      pass('Unvisited offline route stays stable, reconnects manually and preserves query without caching it')
      await context.close()
    }
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ passed: checks.length, checks }, null, 2))
    console.log(`DEPLOY RECOVERY: ${checks.length} checks passed`)
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
