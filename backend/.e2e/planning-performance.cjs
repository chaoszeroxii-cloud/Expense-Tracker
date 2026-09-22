// Synthetic query-plan check. Requires an explicitly named disposable Postgres database.
const { Client } = require('pg')
const assert = require('node:assert/strict')
const { monthRangePredicate } = require('../dist/common/local-date.util')
if (!process.env.PERF_TEST_DATABASE || !/test|e2e/.test(process.env.PERF_TEST_DATABASE)) {
  throw Error('Set PERF_TEST_DATABASE to a disposable database whose name includes test or e2e')
}
const db = new Client({ host: '127.0.0.1', port: Number(process.env.DB_PORT || 15433), database: process.env.PERF_TEST_DATABASE, user: process.env.DB_USER || 'expense_user', password: process.env.DB_PASSWORD })
;(async () => {
  await db.connect()
  try {
    await db.query('BEGIN')
    const { rows: [user] } = await db.query("INSERT INTO users(email, name) VALUES ('query-plan-' || gen_random_uuid() || '@test.local', 'Synthetic query plan') RETURNING id")
    await db.query(`INSERT INTO expenses(user_id, amount, type, occurred_at)
      SELECT $1, 100, 'expense', '2026-10-01'::timestamptz - (n || ' hours')::interval
      FROM generate_series(1, 20000) n`, [user.id])
    await db.query('ANALYZE expenses')
    const predicates = {
      before: "TO_CHAR(occurred_at AT TIME ZONE $3, 'YYYY-MM') = $2",
      after: monthRangePredicate('occurred_at', '$2', '$3'),
    }
    const results = {}
    for (const [name, predicate] of Object.entries(predicates)) {
      const sql = `SELECT SUM(amount) FROM expenses WHERE user_id = $1 AND type = 'expense' AND ${predicate}`
      const params = [user.id, '2026-09', 'Asia/Bangkok']
      const { rows } = await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql, params)
      const plan = rows[0]['QUERY PLAN'][0]
      const total = (await db.query(sql, params)).rows[0].sum
      results[name] = { total, executionMs: plan['Execution Time'], sharedHitBlocks: plan.Plan['Shared Hit Blocks'], plan: plan.Plan }
    }
    assert.equal(results.before.total, results.after.total, 'rewritten predicate must preserve the timezone result')
    const indexConditions = []
    function walk(plan) { if (plan['Index Cond']) indexConditions.push(plan['Index Cond']); for (const child of plan.Plans || []) walk(child) }
    walk(results.after.plan)
    assert(indexConditions.some(condition => condition.includes('occurred_at >=') && condition.includes('occurred_at <')), 'index must bound the month, not scan the whole user history')
    for (const [name, result] of Object.entries(results)) {
      console.log(JSON.stringify({ variant: name, rowsSeeded: 20000, monthlyTotal: result.total, executionMs: result.executionMs, sharedHitBlocks: result.sharedHitBlocks }))
    }
    console.log('PASS same monthly total; range predicate bounds the timestamp index')
  } finally {
    await db.query('ROLLBACK')
    await db.end()
  }
})().catch(err => { console.error(err); process.exitCode = 1 })
