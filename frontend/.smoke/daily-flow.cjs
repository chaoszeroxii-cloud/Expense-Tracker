// Real browser + real API regression for the everyday flows. Use the isolated database
// described in backend/.e2e/README.md. Never point this at a personal/live account.
const { chromium, expect } = require('playwright/test')
const fs = require('node:fs/promises')
const path = require('node:path')
const API = process.env.UX_API_URL || 'http://localhost:3099/api'
const WEB = process.env.UX_WEB_URL || 'http://localhost:5173'
const OUT = path.join(__dirname, 'ux-artifacts')
let checks = 0
const pass = (name) => {
  checks++
  console.log('PASS', name)
}
async function request(method, endpoint, body, token) {
  const response = await fetch(API + endpoint, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw Error(`${method} ${endpoint}: ${response.status} ${JSON.stringify(data)}`)
  return data
}
class MoneyFlow {
  constructor(page, token, categories) {
    this.page = page
    this.token = token
    this.categories = categories
  }
  api(method, endpoint, body) {
    return request(method, endpoint, body, this.token)
  }
  async home() {
    await this.page.goto(WEB)
    await expect(this.page.getByRole('heading', { name: 'เรื่องเงินวันนี้', exact: true })).toBeVisible()
    await expect(this.page.getByRole('region', { name: 'เรื่องเงินวันนี้', exact: true })).toBeVisible()
  }
  async capture() {
    await this.page.getByRole('button', { name: 'บันทึกรายจ่าย', exact: true }).click()
    await expect(this.page.getByRole('heading', { name: 'เพิ่มรายการ' })).toBeVisible()
    await expect(
      this.page.getByRole('button', {
        name: this.categories.find((c) => c.icon === 'food').name,
        exact: true,
      }),
    ).toBeVisible()
  }
  async screenshot(name) {
    await this.page.evaluate(() => document.fonts.ready)
    await this.page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true })
  }
  async noOverflow(name) {
    expect(await this.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    pass(name + ' fits viewport')
  }
}
async function fixture(browser, mode, viewport) {
  const account = await request('POST', '/auth/register', {
    email: `ux-${mode}-${Date.now()}@test.local`,
    name: 'มิน',
    password: 'ux-local-password-123',
    lang: 'th',
  })
  const token = account.accessToken
  await request(
    'POST',
    '/auth/onboarding',
    {
      trackingMode: mode,
      ...(mode === 'plan' ? { monthlySpendingLimit: 15000 } : {}),
      timezone: 'Asia/Bangkok',
      lang: 'th',
    },
    token,
  )
  const [user, categories] = await Promise.all([
    request('GET', '/auth/me', undefined, token),
    request('GET', '/categories', undefined, token),
  ])
  const context = await browser.newContext({ viewport, timezoneId: 'Asia/Bangkok', reducedMotion: 'reduce' })
  await context.tracing.start({ screenshots: true, snapshots: true })
  await context.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('flo_token', token)
      localStorage.setItem('flo_user', JSON.stringify(user))
      localStorage.setItem('flo_lang', 'th')
    },
    { token, user },
  )
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  return { app: new MoneyFlow(page, token, categories), context, errors }
}
async function dailyFlow(browser) {
  const { app, context, errors } = await fixture(browser, 'plan', { width: 1440, height: 1000 })
  const page = app.page
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    const food = app.categories.find((c) => c.icon === 'food')
    const transport = app.categories.find((c) => c.icon === 'transport')
    for (const [categoryId, amount, note] of [
      [food.id, 65, 'ข้าวกลางวัน'],
      [transport.id, 40, 'รถไฟฟ้า'],
      [food.id, 55, 'กาแฟแก้วโปรด'],
    ]) {
      await app.api('POST', '/expenses', {
        categoryId,
        amount,
        type: 'expense',
        note,
        occurredAt: `${today}T12:00:00+07:00`,
      })
    }
    await app.home()
    await app.screenshot('desktop-home')
    await app.noOverflow('Desktop home')
    const before = await app.api('GET', '/expenses')
    await page.getByRole('button', { name: /จดรายการนี้อีกครั้ง: กาแฟแก้วโปรด/ }).click()
    await expect(page.getByRole('spinbutton')).toHaveValue('55.00')
    await expect(page.getByRole('button', { name: food.name, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByLabel('วันที่', { exact: true })).toHaveValue(today)
    expect((await app.api('GET', '/expenses')).length).toBe(before.length)
    pass('Repeat prefills amount, owned category, note and today without saving')
    await page.getByRole('spinbutton').fill('75.50')
    await page.getByRole('button', { name: 'บันทึกแล้วจดต่อ', exact: true }).click()
    await expect(page.getByRole('spinbutton')).toHaveValue('')
    expect((await app.api('GET', '/expenses')).filter((x) => Number(x.amount) === 75.5)).toHaveLength(1)
    pass('Save and add more creates exactly one real row and resets form')
    await page.getByRole('spinbutton').fill('10')
    await page.getByRole('button', { name: food.name, exact: true }).click()
    await page.getByRole('button', { name: 'บันทึกรายจ่าย', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'เรื่องเงินวันนี้', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'เลิกทำ', exact: true }).last().click() // newest save's toast
    await expect(page.getByText('ลบรายการแล้ว', { exact: true })).toBeVisible()
    const rows = await app.api('GET', '/expenses')
    expect(rows).toHaveLength(4)
    const brief = await app.api('GET', '/analytics/daily-brief')
    expect(brief.spentToday).toBe(235.5)
    expect(Number((await app.api('GET', '/analytics/balance')).totalBalance)).toBe(-235.5)
    pass('Save, home totals and Undo agree with the ledger and balance')
    await page.getByRole('link', { name: 'ประวัติ', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'ประวัติ', exact: true })).toBeVisible()
    const search = page.getByRole('searchbox')
    await search.fill('75.5')
    await expect(page.getByText('กาแฟแก้วโปรด', { exact: true })).toHaveCount(1)
    await expect(page.getByText('−฿235.50', { exact: true })).toBeVisible()
    await expect(page.getByText('−฿75.50', { exact: true })).toHaveCount(2) // row and daily total
    pass('History formats decimal strings and sums the displayed day accurately')
    await search.fill('รายการไม่มีอยู่')
    await expect(page.getByRole('button', { name: /ล้างตัวกรอง/ })).toBeVisible()
    await page.getByRole('button', { name: /ล้างตัวกรอง/ }).click()
    await expect(search).toHaveValue('')
    pass('History searches amounts and clears empty results')
    await app.screenshot('desktop-history')
    await page.setViewportSize({ width: 390, height: 844 })
    await app.home()
    await app.screenshot('mobile-home')
    await app.capture()
    await app.screenshot('mobile-add')
    await page.getByRole('spinbutton').fill('0')
    await expect(page.getByRole('button', { name: 'บันทึกรายจ่าย', exact: true })).toBeDisabled()
    await page.getByRole('spinbutton').fill('42')
    await expect(page.getByRole('button', { name: 'บันทึกรายจ่าย', exact: true })).toBeDisabled()
    pass('Amount and category are both required')
    await page.setViewportSize({ width: 320, height: 740 })
    await app.noOverflow('Small-phone capture')
    await page.getByRole('button', { name: 'กลับหน้าหลัก' }).click()
    await page.getByRole('link', { name: 'เครื่องมือ', exact: true }).click()
    await expect(page.getByRole('switch', { name: 'โหมดขั้นสูง' })).toHaveAttribute('aria-checked', 'false')
    await page.getByRole('switch', { name: 'โหมดขั้นสูง' }).click()
    await expect(page.getByRole('switch', { name: 'โหมดขั้นสูง' })).toHaveAttribute('aria-checked', 'true')
    expect((await app.api('GET', '/auth/me')).advancedMode).toBe(true)
    pass('Advanced tools are opt-in and persist through the API')
    await app.noOverflow('Small-phone tools')
    await app.screenshot('mobile-tools')
    // Deliberately inject server failures. These must never masquerade as empty data.
    await page.route('**/api/analytics/daily-brief', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"test failure"}' }),
    )
    await page.getByRole('link', { name: 'หน้าหลัก', exact: true }).click()
    await expect(page.getByText('โหลดข้อมูลไม่สำเร็จ', { exact: true })).toHaveCount(2)
    await expect(page.getByText('ยังไม่มีรายการ', { exact: true })).toHaveCount(0)
    pass('Home server errors never appear as a zero balance or empty ledger')
    await page.unroute('**/api/analytics/daily-brief')
    await page.route('**/api/categories', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"test failure"}' }),
    )
    await page.getByRole('button', { name: 'บันทึกรายจ่าย', exact: true }).click()
    await expect(page.getByText('โหลดข้อมูลไม่สำเร็จ', { exact: true })).toBeVisible()
    await page.getByRole('spinbutton').fill('25')
    await expect(page.getByRole('button', { name: 'บันทึกรายจ่าย', exact: true })).toBeDisabled()
    await page.unroute('**/api/categories')
    await page.getByRole('button', { name: 'ลองใหม่', exact: true }).click()
    await page.getByRole('button', { name: food.name, exact: true }).click()
    await expect(page.getByRole('button', { name: 'บันทึกรายจ่าย', exact: true })).toBeEnabled()
    pass('Failed categories block saving and recover through Retry')
    expect(errors).toEqual([])
    pass('Daily flow has no browser exceptions')
  } finally {
    await context.tracing.stop({ path: path.join(OUT, 'daily-flow.zip') })
    await context.close()
  }
}
async function startingFlow(browser) {
  const { app, context, errors } = await fixture(browser, 'track_only', { width: 390, height: 844 })
  const page = app.page
  try {
    await app.home()
    await expect(page.getByText('วันนี้ใช้ได้อีก', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'วันนี้ไม่มีรายจ่าย', exact: true }).click()
    await expect(page.getByText('บันทึกว่าเป็นวันไม่มีรายจ่ายแล้ว', { exact: true })).toBeVisible()
    expect((await app.api('GET', '/analytics/daily-brief')).coverage.covered).toBe(1)
    pass('No-plan home invents no allowance; no-spend check-in persists')
    await page.getByRole('button', { name: 'ตั้งวงเงินเดือนนี้', exact: true }).click()
    await page.getByRole('button', { name: 'ตั้งวงเงินเดือนนี้', exact: true }).click()
    await page.getByLabel('วงเงินต่อเดือน', { exact: true }).fill('3000')
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
    await expect(page.getByText('บันทึกแผนแล้ว', { exact: true })).toBeVisible()
    const brief = await app.api('GET', '/analytics/daily-brief')
    expect(brief.monthlyLimit).toBe(3000)
    expect(brief.mode).toBe('plan')
    expect(brief.safeToday).toBeGreaterThan(0)
    pass('Track-only user can enable and save a real monthly plan')
    await app.screenshot('mobile-plan')
    await page.getByRole('link', { name: 'เครื่องมือ', exact: true }).click()
    await page.getByRole('button', { name: /ตั้งค่า โปรไฟล์/ }).click()
    await page.getByRole('button', { name: 'หน้าตาแอป', exact: true }).click()
    await page.getByRole('switch', { name: 'โหมดมืด', exact: true }).click()
    await expect(page.locator('html')).toHaveClass('dark')
    await page.getByRole('button', { name: 'en', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible()
    pass('Theme and language update navigation immediately')
    await page.getByRole('link', { name: 'Home', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your money, at a glance.' })).toBeVisible()
    await app.noOverflow('English mobile home')
    await app.screenshot('mobile-dark-english')
    await page.getByRole('button', { name: 'Income', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Income', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: 'Save Income', exact: true })).toBeDisabled()
    pass('Income shortcut opens income capture, without creating a transaction')
    expect(errors).toEqual([])
    pass('New-user flow has no browser exceptions')
  } finally {
    await context.tracing.stop({ path: path.join(OUT, 'starting-flow.zip') })
    await context.close()
  }
}
;(async () => {
  await fs.mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  try {
    const outcomes = await Promise.allSettled([dailyFlow(browser), startingFlow(browser)])
    for (const result of outcomes)
      if (result.status === 'rejected') {
        console.error(result.reason)
        process.exitCode = 1
      }
    console.log(
      `${checks} browser/API checks passed; ${outcomes.filter((x) => x.status === 'rejected').length} flows failed`,
    )
  } finally {
    await browser.close()
  }
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
