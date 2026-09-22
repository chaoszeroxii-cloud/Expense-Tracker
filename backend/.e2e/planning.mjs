import assert from 'node:assert/strict'
const BASE = process.env.API || 'http://localhost:3099/api'
let token
let checks = 0
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks++; console.log('PASS', name) }
async function api(method, path, body, expected = 200) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  assert.equal(res.status, expected, `${method} ${path}: ${text}`)
  return data
}
const email = `planning-${Date.now()}@test.local`
const account = await api('POST', '/auth/register', { email, name: 'Planning E2E', password: 'password123', lang: 'en' }, 201)
token = account.accessToken
await api('POST', '/auth/onboarding', { trackingMode: 'plan', monthlySpendingLimit: 30000 })
const categories = await api('GET', '/categories')
const expenseCategory = categories.find(c => c.type === 'expense')
const incomeCategory = categories.find(c => c.type === 'income')
const { month, today } = await api('GET', '/planning')
const shift = delta => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + delta)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }

await api('PUT', '/budgets/plan', { month: shift(-1), totalAmount: 25000 })
await api('PUT', '/budgets/plan', { month, totalAmount: null })
check('clear stays empty despite an earlier monthly plan', (await api('GET', `/budgets/plan?month=${month}`)).totalAmount, null)
check('clear also stops next-month inheritance', (await api('GET', `/budgets/plan?month=${shift(1)}`)).totalAmount, null)
await api('PUT', '/budgets/plan', { month }, 400)
await api('PUT', '/budgets/plan', { month, totalAmount: 30000 })
check('new plan resumes inheritance', (await api('GET', `/budgets/plan?month=${shift(1)}`)).totalAmount, 30000)
await api('PATCH', '/auth/preferences', { monthlySpendingLimit: 28000 })
check('preferences and monthly page share the same plan', (await api('GET', `/budgets/plan?month=${month}`)).totalAmount, 28000)
await api('PATCH', '/auth/preferences', { trackingMode: 'track_only' })
await api('PATCH', '/auth/preferences', { trackingMode: 'plan' })
check('switching mode does not resurrect a cleared plan', (await api('GET', '/analytics/daily-brief')).monthlyLimit, null)
await api('PUT', '/budgets/plan', { month, totalAmount: 30000 })
await api('POST', '/budgets', { month, categoryId: incomeCategory.id, amount: 100 }, 400)
await api('PUT', '/budgets/batch', { month, items: [{ categoryId: expenseCategory.id, amount: 100 }, { categoryId: expenseCategory.id, amount: 200 }] }, 400)
const batch = await Promise.all([100, 200].map(amount => api('POST', '/budgets', { month, categoryId: expenseCategory.id, amount }, 201)))
check('concurrent category limit saves keep one row', batch[0].id, batch[1].id)

const billInput = { name: 'Rent', amount: 6000, dueDay: 31, categoryId: expenseCategory.id }
const bill = await api('POST', '/planning/bills', billInput, 201)
const before = await api('GET', '/analytics/daily-brief')
check('unpaid bill is reserved in daily brief', before.unpaidBills, 6000)
check('daily allowance excludes reserved bills', before.safeToday, Math.round(24000 / before.daysRemaining * 100) / 100)
const view = await api('GET', '/planning')
const monthDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()
check('day 31 clamps to the end of shorter months', view.bills[0].dueDate, `${month}-${monthDays}`)
const payments = await Promise.all(Array.from({ length: 4 }, () => api('POST', `/planning/bills/${bill.id}/pay`, {}, 201)))
check('concurrent bill payments create exactly one linked expense', new Set(payments.map(p => p.expenseId)).size, 1)
const after = await api('GET', '/analytics/daily-brief')
check('paying a reserved bill leaves daily discretionary allowance stable', after.safeToday, before.safeToday)
check('payment is real spending once', after.monthSpent, 6000)
check('paid bills are no longer reserved', after.unpaidBills, 0)
check('payment affects ledger once', (await api('GET', '/analytics/balance')).totalBalance, -6000)
await api('PATCH', `/expenses/${payments[0].expenseId}`, { type: 'income', categoryId: incomeCategory.id }, 400)
await api('PATCH', `/expenses/${payments[0].expenseId}`, { occurredAt: `${shift(-1)}-15T12:00:00+07:00` }, 400)
await api('PATCH', `/expenses/${payments[0].expenseId}`, { note: 'Rent paid' })
await api('DELETE', `/expenses/${payments[0].expenseId}`)
const reopened = await api('GET', '/planning')
check('deleting payment reopens the bill', reopened.unpaidBills, 6000)
const manual = await api('POST', '/expenses', { type: 'expense', amount: 5900, categoryId: expenseCategory.id, occurredAt: new Date().toISOString(), note: 'Manual rent' }, 201)
await api('POST', `/planning/bills/${bill.id}/pay`, { expenseId: manual.id }, 201)
check('link existing entry creates no duplicate', (await api('GET', '/analytics/daily-brief')).monthSpent, 5900)
check('linked actual amount is shown', (await api('GET', '/planning')).bills[0].paidAmount, 5900)
const second = await api('POST', '/planning/bills', { ...billInput, name: 'Internet' }, 201)
await api('POST', `/planning/bills/${second.id}/pay`, { expenseId: manual.id }, 400)
await api('DELETE', `/planning/bills/${second.id}`)
check('stopping recurrence keeps the outstanding cycle reserved', (await api('GET', '/planning')).unpaidBills, 6000)
await api('DELETE', `/planning/bills/${second.id}/occurrences/${month}`)
check('explicitly cancelling the outstanding cycle releases its reserve', (await api('GET', '/planning')).unpaidBills, 0)

const goalInput = { name: 'Trip', targetAmount: 9000, savedAmount: 1000, targetDate: `${shift(1)}-15` }
const goal = await api('POST', '/planning/goals', goalInput, 201)
check('goal spreads remainder across current and target months', (await api('GET', '/planning')).goals[0].monthlyNeeded, 4000)
check('goal does not move ledger money', (await api('GET', '/analytics/balance')).totalBalance, -5900)
await api('PUT', `/planning/goals/${goal.id}`, { ...goalInput, savedAmount: 9000 })
check('goal completion is based on progress', (await api('GET', '/planning')).goals[0].status, 'complete')
await api('POST', '/planning/goals', { ...goalInput, targetDate: '2026-02-31' }, 400)
await api('POST', '/planning/bills', { ...billInput, dueDay: 32 }, 400)
await api('POST', '/planning/bills', { ...billInput, categoryId: incomeCategory.id }, 400)

// Edits keep the historical wallet; metadata and amount do not reroute old entries.
const a = await api('POST', '/allocations', { name: 'Original', categoryIds: [expenseCategory.id] }, 201)
const routed = await api('POST', '/expenses', { type: 'expense', amount: 100, categoryId: expenseCategory.id, occurredAt: new Date().toISOString() }, 201)
await api('PATCH', `/allocations/${a.id}`, { categoryIds: [] })
const b = await api('POST', '/allocations', { name: 'New link', categoryIds: [expenseCategory.id] }, 201)
await api('PATCH', `/expenses/${routed.id}`, { note: 'Metadata only' })
await api('PATCH', `/expenses/${routed.id}`, { amount: 150 })
const wallets = await api('GET', '/allocations')
check('amount edit stays in original wallet after relink', Number(wallets.find(w => w.id === a.id).balance), -150)
check('newly linked wallet stays untouched', Number(wallets.find(w => w.id === b.id).balance), 0)
await api('DELETE', `/expenses/${routed.id}`)
check('deletion reverses the edited amount in original wallet', Number((await api('GET', '/allocations')).find(w => w.id === a.id).balance), 0)
await api('POST', '/expenses', { type: 'income', amount: 20000, categoryId: incomeCategory.id, occurredAt: new Date().toISOString() }, 201)
await api('POST', `/allocations/${a.id}/move`, { amount: 4000 }, 201)
await api('POST', `/allocations/${b.id}/move`, { amount: 4000 }, 201)
await Promise.all([
  api('POST', `/allocations/${a.id}/transfer`, { targetAllocationId: b.id, amount: 100 }, 201),
  api('POST', `/allocations/${b.id}/transfer`, { targetAllocationId: a.id, amount: 100 }, 201),
])
const transferred = await api('GET', '/allocations')
check('opposite concurrent transfers settle without deadlock or balance drift', [Number(transferred.find(w => w.id === a.id).balance), Number(transferred.find(w => w.id === b.id).balance)], [4000, 4000])

const ownerToken = token
const other = await api('POST', '/auth/register', { email: `other-${email}`, name: 'Other', password: 'password123' }, 201)
token = other.accessToken
await api('PUT', `/planning/bills/${bill.id}`, billInput, 400) // category ownership fails before the bill lookup
await api('POST', `/planning/bills/${bill.id}/pay`, {}, 404)
await api('PUT', `/planning/goals/${goal.id}`, goalInput, 404)
await api('POST', '/budgets', { month, categoryId: expenseCategory.id, amount: 100 }, 400)
check('other user cannot see plans', (await api('GET', '/planning')).bills.length, 0)
token = ownerToken
await api('POST', '/account/factory-reset', { confirm: email, lang: 'en' })
const reset = await api('GET', '/planning')
check('account reset clears bills and savings goals', [reset.bills.length, reset.goals.length], [0, 0])
check('account reset clears plan and balance', [(await api('GET', '/analytics/daily-brief')).monthlyLimit, (await api('GET', '/analytics/balance')).totalBalance], [null, 0])
console.log(`${checks} planning assertions passed; validation, isolation and payment guards also passed.`)
