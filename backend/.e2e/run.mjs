// End-to-end check of the paths this audit changed.
//
// Runs against a real backend and a real Postgres. A green typecheck says nothing about
// whether money moves correctly, and several of the bugs fixed here were invisible to
// every static check in the project.

const BASE = process.env.API || 'http://localhost:3099/api'
let pass = 0
let fail = 0

function check(name, cond, detail = '') {
  const line = cond ? '  PASS  ' + name : '  FAIL  ' + name + (detail ? ' -- ' + detail : '')
  if (cond) pass++; else fail++
  // Printed as it happens: a crash later in the run must not swallow what already ran.
  console.log(line)
}

let token = null

async function api(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token && !opts.noAuth) headers.Authorization = 'Bearer ' + token

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, data }
}

const email = 'e2e-' + Date.now() + '@test.local'

// -- 1. Register + seeded categories -----------------------------------------
const reg = await api(
  'POST', '/auth/register',
  { email, name: 'E2E', password: 'password123', lang: 'th' },
  { noAuth: true },
)
check('register returns a token', reg.status === 201 && !!reg.data?.accessToken, 'status=' + reg.status)
token = reg.data?.accessToken

const cats = (await api('GET', '/categories')).data
const expCat = cats.find(c => c.type === 'expense')
const incCat = cats.find(c => c.type === 'income')
check('categories seeded', cats.length > 0 && !!expCat && !!incCat, 'n=' + cats?.length)

// -- 2. Timezone, then the month-boundary case -------------------------------
await api('PATCH', '/auth/preferences', { timezone: 'Asia/Bangkok' })

// 2026-02-01 03:00 +07 is 2026-01-31 20:00 UTC. A server-timezone month filter files
// this under January; the user calls it February.
const boundary = await api('POST', '/expenses', {
  categoryId: expCat.id, amount: 100, type: 'expense',
  occurredAt: '2026-02-01T03:00:00+07:00', note: 'boundary',
})
check('create expense at the month boundary', boundary.status === 201, JSON.stringify(boundary.data))

const febList = (await api('GET', '/expenses?month=2026-02')).data
const janList = (await api('GET', '/expenses?month=2026-01')).data
check(
  'boundary expense lands in February for a Bangkok user',
  Array.isArray(febList) && febList.some(e => e.note === 'boundary'),
  'feb=' + febList?.length + ' jan=' + janList?.length,
)
check(
  'boundary expense does NOT land in January',
  Array.isArray(janList) && !janList.some(e => e.note === 'boundary'),
)

const febSummary = (await api('GET', '/analytics/summary?month=2026-02')).data
check('analytics summary agrees with the list', Number(febSummary?.totalExpense) === 100, JSON.stringify(febSummary))

// -- 3. Category type must match entry type ----------------------------------
const mismatch = await api('POST', '/expenses', {
  categoryId: incCat.id, amount: 50, type: 'expense', occurredAt: '2026-02-10T10:00:00+07:00',
})
check('income category rejected for an expense', mismatch.status === 400, 'status=' + mismatch.status)

// -- 4. Amount bounds --------------------------------------------------------
const tooBig = await api('POST', '/expenses', {
  categoryId: expCat.id, amount: 1e12, type: 'expense', occurredAt: '2026-02-10T10:00:00+07:00',
})
check('oversized amount is a 400, not a 500', tooBig.status === 400, 'status=' + tooBig.status)

// -- 5. Balance accounting ---------------------------------------------------
await api('POST', '/expenses', {
  categoryId: incCat.id, amount: 10000, type: 'income', occurredAt: '2026-02-05T10:00:00+07:00',
})
const bal1 = (await api('GET', '/analytics/balance')).data
check(
  'income raises totalBalance',
  Number(bal1?.totalBalance) === 9900,
  'expected 9900 (10000 income - 100 expense), got ' + bal1?.totalBalance,
)

// -- 6. Wallets: link, fund, spend, and the duplicate-link rule --------------
const w1 = await api('POST', '/allocations', { name: 'Wallet A', categoryIds: [expCat.id] })
check('create wallet with a linked category', w1.status === 201, JSON.stringify(w1.data))

const w2 = await api('POST', '/allocations', { name: 'Wallet B', categoryIds: [expCat.id] })
check(
  'second wallet cannot claim the same category',
  w2.status === 400,
  'status=' + w2.status + ' ' + JSON.stringify(w2.data?.message),
)

const move = await api('POST', '/allocations/' + w1.data.id + '/move', { amount: 5000 })
check('fund the wallet from the unallocated pool', move.status === 201, JSON.stringify(move.data))

const spend = await api('POST', '/expenses', {
  categoryId: expCat.id, amount: 300, type: 'expense', occurredAt: '2026-02-06T10:00:00+07:00',
})
check('expense stores the resolved allocation_id', !!spend.data?.allocationId, 'allocationId=' + spend.data?.allocationId)

let wallets = (await api('GET', '/allocations')).data
check('linked expense debits the wallet', Number(wallets[0]?.balance) === 4700, 'expected 4700, got ' + wallets[0]?.balance)

// -- 7. Deleting that expense must credit the wallet back --------------------
await api('DELETE', '/expenses/' + spend.data.id)
wallets = (await api('GET', '/allocations')).data
check(
  'deleting the expense returns the money to the wallet',
  Number(wallets[0]?.balance) === 5000,
  'expected 5000, got ' + wallets[0]?.balance,
)

// -- 8. A wallet holding money cannot be deleted -----------------------------
const delFull = await api('DELETE', '/allocations/' + w1.data.id)
check(
  'wallet with a balance refuses deletion',
  delFull.status === 400,
  'status=' + delFull.status + ' ' + JSON.stringify(delFull.data?.message),
)

// -- 9. Idempotent create: the offline-replay case ---------------------------
const key = 'e2e-replay-key-0001'
const first = await api('POST', '/expenses', {
  categoryId: expCat.id, amount: 77, type: 'expense',
  occurredAt: '2026-02-07T10:00:00+07:00', clientKey: key,
})
const replay = await api('POST', '/expenses', {
  categoryId: expCat.id, amount: 77, type: 'expense',
  occurredAt: '2026-02-07T10:00:00+07:00', clientKey: key,
})
check('replay returns the same transaction', first.data?.id === replay.data?.id, first.data?.id + ' vs ' + replay.data?.id)

const afterReplay = (await api('GET', '/analytics/balance')).data
check(
  'replay does not move the balance twice',
  Number(afterReplay.totalBalance) === Number(bal1.totalBalance) - 77,
  'expected ' + (Number(bal1.totalBalance) - 77) + ', got ' + afterReplay.totalBalance,
)

// -- 10. Category delete: impact report, then reassign -----------------------
const impact = (await api('GET', '/categories/' + expCat.id + '/delete-impact')).data
check('delete-impact counts the affected transactions', impact?.transactionCount >= 2, JSON.stringify(impact))
check('delete-impact names the linked wallet', impact?.linkedWallet === 'Wallet A', 'got ' + impact?.linkedWallet)

const otherExpCat = cats.find(c => c.type === 'expense' && c.id !== expCat.id)
const delCat = await api('DELETE', '/categories/' + expCat.id + '?reassignTo=' + otherExpCat.id)
check('category delete with reassign succeeds', delCat.status === 200, 'status=' + delCat.status)

const listAfter = await api('GET', '/expenses?month=2026-02')
const stillThere = Array.isArray(listAfter.data) ? listAfter.data : null
check(
  'transaction list still readable after the category delete',
  stillThere !== null,
  'status=' + listAfter.status + ' body=' + JSON.stringify(listAfter.data),
)
if (stillThere) {
  const orphaned = stillThere.filter(e => e.categoryId === null)
  check('no transaction was orphaned by the delete', orphaned.length === 0, 'orphaned=' + orphaned.length)
}

// -- 11. Health endpoint the Docker healthcheck now uses ---------------------
const health = await api('GET', '/health', null, { noAuth: true })
check('/api/health answers without auth', health.status === 200 && health.data?.status === 'ok', 'status=' + health.status)

console.log('\n  ' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
