// Proves the migration on existing rows; all schema/data changes roll back.
const assert = require('node:assert/strict')
const { DataSource } = require('typeorm')
const { BillOccurrences1785250000000 } = require('../dist/migrations/1785250000000-BillOccurrences')
const db = new DataSource({ type: 'postgres', host: '127.0.0.1', port: 15434,
  username: 'expense_user', password: 'fix-local-only', database: 'moneyflow_fix_test' })
async function run() {
  await db.initialize()
  assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'moneyflow_fix_test')
  const q = db.createQueryRunner()
  await q.connect(); await q.startTransaction()
  try {
    const migration = new BillOccurrences1785250000000()
    await migration.down(q)
    const [user] = await q.query("INSERT INTO users(email,name,timezone) VALUES ('migration-fixture@test.local','Migration','Asia/Bangkok') RETURNING id")
    const [cat] = await q.query("INSERT INTO categories(user_id,name,type,icon,color) VALUES ($1,'Rent','expense','housing','#000000') RETURNING id", [user.id])
    const [months] = await q.query("SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok','YYYY-MM') AS current, to_char((now() AT TIME ZONE 'Asia/Bangkok')-interval '1 month','YYYY-MM') AS previous")
    const [bill] = await q.query("INSERT INTO recurring_bills(user_id,name,amount,category_id,due_day,start_month) VALUES ($1,'Rent',6000,$2,31,$3) RETURNING id", [user.id,cat.id,months.previous])
    const [expense] = await q.query("INSERT INTO expenses(user_id,category_id,amount,type,occurred_at) VALUES ($1,$2,5900,'expense',now()) RETURNING id", [user.id,cat.id])
    await q.query('INSERT INTO bill_payments(user_id,bill_id,month,expense_id) VALUES ($1,$2,$3,$4)', [user.id,bill.id,months.current,expense.id])
    await migration.up(q)
    const cycles = await q.query('SELECT month,amount FROM bill_occurrences WHERE user_id=$1 ORDER BY month', [user.id])
    assert.deepEqual(cycles, [{ month: months.previous, amount: '6000.00' }, { month: months.current, amount: '6000.00' }])
    const [paid] = await q.query('SELECT p.expense_id,e.amount FROM bill_payments p JOIN expenses e ON e.id=p.expense_id WHERE p.user_id=$1', [user.id])
    assert.deepEqual(paid, { expense_id: expense.id, amount: '5900.00' })
    console.log('PASS migration backfills unpaid cycles and preserves actual paid expense')
  } finally { await q.rollbackTransaction(); await q.release(); await db.destroy() }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
