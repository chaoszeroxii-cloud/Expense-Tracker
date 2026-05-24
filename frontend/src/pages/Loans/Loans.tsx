import { useState, useEffect, useCallback } from 'react'
import { loansApi } from '../../api'
import type { Loan } from '../../types'
import Icon from '@mdi/react'
import { mdiPlus, mdiTrashCanOutline, mdiCashMultiple, mdiClose, mdiCheck } from '@mdi/js'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function Loans() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAddLoan, setShowAddLoan] = useState(false)
  const [showPayment, setShowPayment] = useState<string | null>(null)
  const [loanForm, setLoanForm] = useState({ borrower: '', amount: '', note: '', lentAt: new Date().toISOString().slice(0, 10) })
  const [payForm, setPayForm] = useState({ amount: '', paidAt: new Date().toISOString().slice(0, 10), note: '' })
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'active' | 'all'>('active')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await loansApi.getSummary()
    setLoans(filter === 'active' ? data.loans : await loansApi.findAll())
    setTotalOutstanding(data.totalOutstanding)
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const handleCreateLoan = async () => {
    if (!loanForm.borrower || !loanForm.amount) return
    setSaving(true)
    await loansApi.create({ ...loanForm, amount: parseFloat(loanForm.amount) })
    setShowAddLoan(false)
    setLoanForm({ borrower: '', amount: '', note: '', lentAt: new Date().toISOString().slice(0, 10) })
    await load()
    setSaving(false)
  }

  const handlePayment = async () => {
    if (!showPayment || !payForm.amount) return
    setSaving(true)
    await loansApi.addPayment(showPayment, { amount: parseFloat(payForm.amount), paidAt: payForm.paidAt, note: payForm.note })
    setShowPayment(null)
    setPayForm({ amount: '', paidAt: new Date().toISOString().slice(0, 10), note: '' })
    await load()
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    await loansApi.remove(id)
    await load()
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-base-theme">เงินให้ยืม</h1>
          <p className="text-xs text-muted-theme mt-0.5">ติดตามว่าใครค้างเท่าไหร่</p>
        </div>
        <button
          onClick={() => setShowAddLoan(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold active:scale-95 transition-transform"
        >
          <Icon path={mdiPlus} size={0.8} />
          บันทึก
        </button>
      </div>

      {/* Summary card */}
      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-3">
          <Icon path={mdiCashMultiple} size={1.2} color="#f59e0b" />
          <div>
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">ยอดค้างชำระทั้งหมด</p>
            <p className="text-2xl font-extrabold text-amber-800 dark:text-amber-200">฿{fmt(totalOutstanding)}</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['active', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors
              ${filter === f ? 'bg-brand-600 text-white' : 'bg-card border border-[var(--border)] text-muted-theme'}`}
          >
            {f === 'active' ? 'ยังค้างอยู่' : 'ทั้งหมด'}
          </button>
        ))}
      </div>

      {/* Loan list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="h-28 bg-card rounded-2xl animate-pulse border border-[var(--border)]" />)}
        </div>
      ) : loans.length === 0 ? (
        <div className="text-center py-12 text-muted-theme">
          <div className="text-4xl mb-2">🤝</div>
          <p className="font-semibold">ไม่มีเงินค้างชำระ</p>
          <p className="text-sm mt-1">กด + เพื่อบันทึกการให้ยืม</p>
        </div>
      ) : (
        <div className="space-y-3">
          {loans.map(loan => {
            const pct = loan.amount > 0 ? (loan.paidAmount / loan.amount) * 100 : 0
            return (
              <div key={loan.id} className="bg-card rounded-2xl border border-[var(--border)] p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base-theme">{loan.borrower}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold
                        ${loan.status === 'settled' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                        {loan.status === 'settled' ? 'คืนแล้ว' : 'ค้างอยู่'}
                      </span>
                    </div>
                    {loan.note && <p className="text-xs text-muted-theme mt-0.5">{loan.note}</p>}
                    <p className="text-xs text-muted-theme">{new Date(loan.lentAt).toLocaleDateString('th-TH')}</p>
                  </div>
                  <button onClick={() => handleDelete(loan.id)} className="p-1 text-muted-theme hover:text-red-500">
                    <Icon path={mdiTrashCanOutline} size={0.75} />
                  </button>
                </div>

                <div className="w-full bg-[var(--input)] rounded-full h-1.5 overflow-hidden mb-2">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-muted-theme text-xs">คืนแล้ว </span>
                    <span className="font-semibold text-base-theme">฿{fmt(loan.paidAmount)}</span>
                    <span className="text-muted-theme text-xs"> / ฿{fmt(loan.amount)}</span>
                  </div>
                  {loan.status === 'active' && (
                    <button
                      onClick={() => setShowPayment(loan.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold"
                    >
                      <Icon path={mdiCheck} size={0.65} />
                      บันทึกการคืน
                    </button>
                  )}
                </div>
                {loan.outstanding > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-2">
                    ยังค้างอยู่ ฿{fmt(loan.outstanding)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Loan Modal */}
      {showAddLoan && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-card rounded-3xl p-6 space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base-theme">บันทึกการให้ยืม</h2>
              <button onClick={() => setShowAddLoan(false)} className="p-1 text-muted-theme"><Icon path={mdiClose} size={0.9} /></button>
            </div>
            <input placeholder="ชื่อผู้ยืม" value={loanForm.borrower} onChange={e => setLoanForm(f => ({ ...f, borrower: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <input type="number" placeholder="จำนวนเงิน (บาท)" value={loanForm.amount} onChange={e => setLoanForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <input placeholder="หมายเหตุ (ไม่บังคับ)" value={loanForm.note} onChange={e => setLoanForm(f => ({ ...f, note: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <div>
              <label className="text-xs text-muted-theme mb-1 block">วันที่ให้ยืม</label>
              <input type="date" value={loanForm.lentAt} onChange={e => setLoanForm(f => ({ ...f, lentAt: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            </div>
            <button onClick={handleCreateLoan} disabled={saving || !loanForm.borrower || !loanForm.amount}
              className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-sm disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-card rounded-3xl p-6 space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base-theme">บันทึกการคืนเงิน</h2>
              <button onClick={() => setShowPayment(null)} className="p-1 text-muted-theme"><Icon path={mdiClose} size={0.9} /></button>
            </div>
            <input type="number" placeholder="จำนวนเงินที่คืน" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <div>
              <label className="text-xs text-muted-theme mb-1 block">วันที่คืน</label>
              <input type="date" value={payForm.paidAt} onChange={e => setPayForm(f => ({ ...f, paidAt: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            </div>
            <button onClick={handlePayment} disabled={saving || !payForm.amount}
              className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึกการคืน'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
