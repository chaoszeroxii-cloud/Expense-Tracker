// Smoke test: does the production bundle actually boot after the code-splitting change?
// A smaller bundle that white-screens is worse than the one we started with.
const { chromium } = require('playwright')
const path = require('path')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const errors = []
  const failedRequests = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => {
    if (m.type() !== 'error') return
    const text = m.text()
    // @vercel/speed-insights fetches /_vercel/... which only exists on Vercel. Expected
    // noise in any other environment, and unrelated to whether the app booted.
    if (text.includes('speed-insights') || text.includes('Failed to load resource')) return
    errors.push('console: ' + text)
  })
  page.on('requestfailed', r => failedRequests.push(r.url() + ' :: ' + r.failure()?.errorText))

  // The API is not running; stub it so failures are auth-shaped, not network-shaped.
  await page.route('**/api/**', route => route.fulfill({
    status: 401, contentType: 'application/json', body: '{"message":"Unauthorized"}',
  }))

  const base = process.env.SMOKE_URL
  await page.goto(base + '/login', { waitUntil: 'networkidle' })

  const rootHtml = await page.locator('#root').innerHTML()
  const bodyText = await page.locator('body').innerText()

  // Does the lazy AuthPage chunk actually resolve and render?
  const rendered = rootHtml.trim().length > 200

  console.log(JSON.stringify({
    rendered,
    rootHtmlLength: rootHtml.trim().length,
    textSample: bodyText.replace(/\s+/g, ' ').slice(0, 160),
    pageErrors: errors,
    failedRequests: failedRequests.filter(u => !u.includes('/api/')),
  }, null, 2))

  await browser.close()
  const ok = rendered && errors.length === 0
  process.exit(ok ? 0 : 1)
})().catch(e => { console.error('SMOKE HARNESS FAILED:', e); process.exit(2) })
