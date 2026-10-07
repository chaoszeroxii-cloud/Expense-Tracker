const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs/promises')
const mdi = require('@mdi/js')

exports.api = async ({ account, clearThrottle, pass }) => {
  const user = await account('icons'), other = await account('icons-other')
  const category = await user.call('POST', '/categories', { name: 'ไอคอนกำหนดเอง', type: 'expense', icon: 'mdi:train', memoCode: 'icon' })
  assert.equal(category.icon, 'mdiTrain')
  for (const invalid of ['mdi:unknown-icon-abcxyz', '__proto__', 'constructor', '<svg onload=alert(1)>',
    'https://example.test/icon.svg', 'javascript:alert(1)', '../train', 123, {}, []]) {
    await user.call('PATCH', `/categories/${category.id}`, { icon: invalid }, 400)
  }
  for (const [input, expected] of [['mdi-train', 'mdiTrain'], ['train', 'mdiTrain'], ['mdiAccountCashOutline', 'mdiAccountCashOutline'], ['🍜', 'food'], ['food', 'food']]) {
    const updated = await user.call('PATCH', `/categories/${category.id}`, { icon: input })
    assert.equal(updated.icon, expected); assert.equal(updated.memoCode, 'icon')
  }
  await other.call('PATCH', `/categories/${category.id}`, { icon: 'mdi:train' }, 404)
  const transaction = await user.call('POST', '/expenses', { categoryId: category.id, type: 'expense', amount: 17,
    note: 'Custom icon test', occurredAt: new Date().toISOString() })
  assert.equal((await user.call('GET', `/expenses/${transaction.id}`)).category.icon, 'food')
  clearThrottle()
  pass('category icon API validates the installed catalog, rejects markup/prototype keys, preserves memo codes and enforces ownership')
  return { user, category, transaction }
}

exports.browser = async ({ browser, WEB, expect, fixture, clearThrottle, pass, output }) => {
  const { user, category, transaction } = fixture
  const context = await browser.newContext({ viewport: { width: 390, height: 1000 } })
  try {
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('flo_token', token); localStorage.setItem('flo_user', JSON.stringify(user))
      if (!localStorage.getItem('flo_lang')) localStorage.setItem('flo_lang', 'th')
      if (!localStorage.getItem('flo_theme')) localStorage.setItem('flo_theme', 'dark')
    }, user)
    const page = await context.newPage(), errors = [], iconRequests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (request.url().includes('/__mdi/')) iconRequests.push(request.url()) })
    clearThrottle(); await page.goto(WEB + '/settings')
    const cats = page.locator('#settings-categories')
    const edit = () => cats.getByRole('button', { name: `แก้ไขหมวดหมู่ ${category.name}`, exact: true }).click()
    await edit()
    assert.deepEqual(iconRequests, [], 'Presets must not load the full icon catalog')
    const input = cats.getByLabel('ใช้ไอคอน MDI อื่น', { exact: true })
    const save = cats.getByRole('button', { name: 'บันทึก', exact: true })
    const preview = cats.getByRole('img', { name: 'ไอคอนตัวอย่าง', exact: true }).locator('path')
    await input.fill('<svg onload=alert(1)>')
    await expect(cats.getByRole('alert')).toContainText('ไม่พบรหัส MDI')
    await expect(save).toBeDisabled(); assert.deepEqual(iconRequests, [])
    await input.fill('mdi:unknown-icon-abcxyz')
    await expect(cats.getByRole('alert')).toContainText('ไม่พบรหัส MDI')
    await expect(save).toBeDisabled()

    // A catalog network failure must leave the form intact and allow a retry.
    const route = '**/__mdi/t.json'
    await page.route(route, r => r.abort('failed'))
    await input.fill('mdi:train')
    await expect(cats.getByRole('alert')).toContainText('โหลดคลังไอคอนไม่สำเร็จ')
    await expect(save).toBeDisabled(); await expect(input).toHaveValue('mdi:train')
    await page.unroute(route)
    await cats.getByRole('button', { name: 'ลองโหลดไอคอนอีกครั้ง', exact: true }).click()
    await expect(preview).toHaveAttribute('d', mdi.mdiTrain)
    await expect(save).toBeEnabled()
    // Switching choices while a request is in flight must not restore an old icon.
    await page.route('**/__mdi/a.json', async r => { await new Promise(resolve => setTimeout(resolve, 500)); await r.continue() })
    const requested = page.waitForRequest(request => request.url().endsWith('/__mdi/a.json'))
    await input.fill('mdiAccountCashOutline'); await requested
    await input.fill('mdi:train'); await expect(preview).toHaveAttribute('d', mdi.mdiTrain)
    await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.name.endsWith('/__mdi/a.json')).length)).toBeGreaterThan(0)
    await expect(preview).toHaveAttribute('d', mdi.mdiTrain)
    await page.unroute('**/__mdi/a.json')
    await input.fill('mdiAccountCashOutline')
    await expect(preview).toHaveAttribute('d', mdi.mdiAccountCashOutline)
    clearThrottle(); await save.click(); await expect(input).toHaveCount(0)
    assert.equal((await user.call('GET', `/expenses/${transaction.id}`)).category.icon, 'mdiAccountCashOutline')
    await page.reload(); await edit(); await expect(input).toHaveValue('mdiAccountCashOutline')
    await expect(preview).toHaveAttribute('d', mdi.mdiAccountCashOutline)
    await expect(cats.getByLabel('รหัสหมวดในบันทึกช่วยจำ (ไม่บังคับ)')).toHaveValue('icon')
    for (const [theme, width] of [['dark', 390], ['light', 1440]]) {
      await page.evaluate(theme => localStorage.setItem('flo_theme', theme), theme)
      await page.setViewportSize({ width, height: 1000 }); clearThrottle(); await page.reload(); await edit()
      await expect(preview).toHaveAttribute('d', mdi.mdiAccountCashOutline)
      await input.scrollIntoViewIfNeeded()
      assert.equal(await page.locator('#main-content').evaluate(el => el.scrollWidth <= el.clientWidth), true)
      await page.screenshot({ path: path.join(output, `category-icons-${theme}-${width}.png`) })
    }
    await cats.getByRole('group', { name: 'ไอคอนแนะนำ' }).getByRole('button', { name: 'Food', exact: true }).click()
    await expect(input).toHaveValue(''); await expect(save).toBeEnabled()
    await input.fill('mdi:train'); await expect(preview).toHaveAttribute('d', mdi.mdiTrain)
    clearThrottle(); await save.click(); await expect(input).toHaveCount(0)
    await page.goto(WEB + '/history')
    const row = page.locator('div.group').filter({ hasText: 'Custom icon test' })
    await expect(row.locator('svg path').first()).toHaveAttribute('d', mdi.mdiTrain)
    assert.deepEqual(errors, [])
    pass('browser custom icon preview validates, retries, ignores stale responses, persists and renders in History on mobile/desktop')
  } finally { await context.close() }
}

exports.production = async ({ browser, expect, fixture, API, ROOT, clearThrottle, pass }) => {
  const { preview } = await import('vite')
  const server = await preview({ root: path.join(ROOT, 'frontend'), envDir: __dirname, preview: { host: '127.0.0.1', port: 5177, strictPort: true } })
  const context = await browser.newContext()
  try {
    const origin = 'http://127.0.0.1:5177', { user } = fixture
    // Use the real disposable backend regardless of production API base settings.
    await context.route('**/api/**', async route => {
      const target = new URL(route.request().url())
      const response = await route.fetch({ url: API + target.pathname.replace(/^\/api/, '') + target.search })
      await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': origin } })
    })
    const page = await context.newPage(), paths = []
    page.on('request', request => { paths.push(new URL(request.url()).pathname) })
    await page.goto(origin + '/login'); await page.waitForLoadState('networkidle')
    assert.ok(!paths.some(p => /\/mdi-[a-z]-/.test(p)), 'Login must not eagerly load custom catalogs')
    const files = await fs.readdir(path.join(ROOT, 'frontend/dist/assets'))
    assert.equal(files.filter(file => /^mdi-[a-z]-[\w-]+\.json$/.test(file)).length, 26)
    const main = files.find(file => /^index-[\w-]+\.js$/.test(file))
    assert.ok(!(await fs.readFile(path.join(ROOT, 'frontend/dist/assets', main), 'utf8')).includes(mdi.mdiTrain))
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('flo_token', token); localStorage.setItem('flo_user', JSON.stringify(user)); localStorage.setItem('flo_lang', 'th')
    }, { token: user.token, user: user.user })
    clearThrottle(); await page.goto(origin + '/history')
    const icon = page.locator('div.group').filter({ hasText: 'Custom icon test' }).locator('svg path').first()
    await expect(icon).toHaveAttribute('d', mdi.mdiTrain)
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    const chunk = files.find(file => /^mdi-t-[\w-]+\.json$/.test(file))
    await page.evaluate(async file => { const response = await fetch('/assets/' + file); if (!response.ok) throw new Error('Missing catalog chunk') }, chunk)
    await expect.poll(() => page.evaluate(async file => !!(await (await caches.open('moneyflow-mdi-v1')).match('/assets/' + file)), chunk)).toBe(true)
    await context.setOffline(true)
    assert.equal(await page.evaluate(async file => (await fetch('/assets/' + file)).ok, chunk), true)
    pass('production keeps 26 icon groups lazy; stored custom icons render and used chunks remain available from the PWA cache offline')
  } finally { await context.close(); await new Promise(resolve => server.httpServer.close(resolve)) }
}
