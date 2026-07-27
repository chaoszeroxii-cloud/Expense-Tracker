import { useState, useEffect, useCallback } from 'react'
import { loansApi } from '../../api'
import type { Loan } from '../../types'
import Icon from '@mdi/react'
import {
  mdiPlus, mdiTrashCanOutline, mdiCashMultiple, mdiClose, mdiCheck,
  mdiArrowTopRight, mdiArrowBottomLeft, mdiHandshakeOutline, mdiCreditCardOutline,
} from '@mdi/js'
import { useT, useI18n } from '../../store/i18n.store'
import ConfirmModal from '../../components/ui/ConfirmModal'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Loans() {
  const t = useT()
  const lang = useI18n(s => s.lang)
  const dateLocale = lang === 'en' ? 'en-US' : 'th-TH'
  const [loans, setLoans] = useState<Loan[]>([])
  const [summary, setSummary] = useState({ totalOutstanding: 0, totalOwed: 0 })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'lent' | 'borrowed'>('lent')
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [showAdd, setShowAdd] = useState(false)
  const [showPayment, setShowPayment] = useState<string | null>(null)
  const [form, setForm] = useState({
    direction: 'lent' as 'lent' | 'borrowed',
    borrower: '', amount: '', note: '',
    lentAt: new Date().toISOString().slice(0, 10),
  })
  const [payForm, setPayForm] = useState({ amount: '', paidAt: new Date().toISOString().slice(0, 10), note: '' })
  const [saving, setSaving] = useState(false)
  const [confirmState, setConfirmState] = useState<{ open: boolean; onConfirm: () => void }>({ open: false, onConfirm: () => {} })

  const load = useCallback(async () => {
    setLoading(true)
    const [data, all] = await Promise.all([
      loansApi.getSummary(),
      filter === 'all' ? loansApi.findAll() : Promise.resolve(null),
    ])
    setSummary({ totalOutstanding: data.totalOutstanding, totalOwed: data.totalOwed })
    setLoans(filter === 'all' ? (all ?? []) : data.loans)
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = (e: Event) => {
      const types: string[] = (e as CustomEvent).detail?.types ?? []
      if (types.includes('loans') || types.includes('dashboard')) load()
    }
    window.addEventListener('moneyflow:refresh', handler)
    return () => window.removeEventListener('moneyflow:refresh', handler)
  }, [load])

  const visible = loans.filter(l => l.direction === tab)

  const handleCreate = async () => {
    if (!form.borrower || !form.amount) return
    setSaving(true)
    await loansApi.create({ ...form, amount: parseFloat(form.amount) })
    setShowAdd(false)
    setForm({ direction: 'lent', borrower: '', amount: '', note: '', lentAt: new Date().toISOString().slice(0, 10) })
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

  const handleDelete = (id: string) => {
    setConfirmState({
      open: true,
      onConfirm: async () => {
        setConfirmState(s => ({ ...s, open: false }))
        await loansApi.remove(id)
        await load()
      },
    })
  }

  const openAdd = (dir: 'lent' | 'borrowed') => {
    setForm(f => ({ ...f, direction: dir }))
    setShowAdd(true)
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-base-theme">{t('loans_title')}</h1>
          <p className="text-xs text-muted-theme mt-0.5">{t('loans_subtitle')}</p>
        </div>
        <button
          onClick={() => openAdd(tab)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold active:scale-95 transition-transform"
        >
          <Icon path={mdiPlus} size={0.8} />
          {t('save')}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-3.5 border border-amber-200 dark:border-amber-800 cursor-pointer"
          onClick={() => setTab('lent')}
        >
          <div className="flex items-center gap-2 mb-1">
            <Icon path={mdiArrowTopRight} size={0.8} color="#f59e0b" />
            <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">{t('outstanding_recv')}</span>
          </div>
          <p className="text-xl font-extrabold text-amber-800 dark:text-amber-200">฿{fmt(summary.totalOutstanding)}</p>
        </div>
        <div
          className="bg-rose-50 dark:bg-rose-900/20 rounded-2xl p-3.5 border border-rose-200 dark:border-rose-800 cursor-pointer"
          onClick={() => setTab('borrowed')}
        >
          <div className="flex items-center gap-2 mb-1">
            <Icon path={mdiArrowBottomLeft} size={0.8} color="#f43f5e" />
            <span className="text-xs text-rose-700 dark:text-rose-300 font-medium">{t('to_repay')}</span>
          </div>
          <p className="text-xl font-extrabold text-rose-800 dark:text-rose-200">฿{fmt(summary.totalOwed)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['lent', 'borrowed'] as const).map(d => (
          <button
            key={d}
            onClick={() => setTab(d)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors
              ${tab === d
                ? d === 'lent' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                : 'bg-card border border-[var(--border)] text-muted-theme'}`}
          >
            <Icon path={d === 'lent' ? mdiArrowTopRight : mdiArrowBottomLeft} size={0.7} />
            {d === 'lent' ? t('lent_label') : t('borrowed_label')}
          </button>
        ))}
        <div className="flex-1" />
        {(['active', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors
              ${filter === f ? 'bg-brand-600 text-white' : 'bg-card border border-[var(--border)] text-muted-theme'}`}
          >
            {f === 'active' ? t('filter_active') : t('filter_all')}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-28 bg-card rounded-2xl animate-pulse border border-[var(--border)]" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-muted-theme">
          <Icon
            path={tab === 'lent' ? mdiHandshakeOutline : mdiCreditCardOutline}
            size={2}
            aria-hidden="true"
            className="mx-auto mb-2"
          />
          <p className="font-semibold">{tab === 'lent' ? t('no_loans_lent') : t('no_loans_borrowed')}</p>
          <p className="text-sm mt-1">{t('tap_plus_record')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(loan => {
            const pct = loan.amount > 0 ? (loan.paidAmount / loan.amount) * 100 : 0
            const isLent = loan.direction === 'lent'
            return (
              <div key={loan.id} className="bg-card rounded-2xl border border-[var(--border)] p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base-theme">{loan.borrower}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold
                        ${loan.status === 'settled'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : isLent
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}>
                        {loan.status === 'settled' ? t('loan_settled') : isLent ? t('loan_active_lent') : t('loan_active_borrowed')}
                      </span>
                    </div>
                    {loan.note && <p className="text-xs text-muted-theme mt-0.5">{loan.note}</p>}
                    <p className="text-xs text-muted-theme">{new Date(loan.lentAt).toLocaleDateString(dateLocale)}</p>
                  </div>
                  <button onClick={() => handleDelete(loan.id)} className="p-1 text-muted-theme hover:text-red-500">
                    <Icon path={mdiTrashCanOutline} size={0.75} />
                  </button>
                </div>

                <div className="w-full bg-[var(--input)] rounded-full h-1.5 overflow-hidden mb-2">
                  <div className={`h-full rounded-full transition-all ${isLent ? 'bg-emerald-500' : 'bg-rose-400'}`}
                    style={{ width: `${pct}%` }} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-muted-theme text-xs">{isLent ? t('loan_returned') : t('loan_paid_out')} </span>
                    <span className="font-semibold text-base-theme">฿{fmt(loan.paidAmount)}</span>
                    <span className="text-muted-theme text-xs"> / ฿{fmt(loan.amount)}</span>
                  </div>
                  {loan.status === 'active' && (
                    <button
                      onClick={() => setShowPayment(loan.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-white text-xs font-semibold
                        ${isLent ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    >
                      <Icon path={mdiCheck} size={0.65} />
                      {isLent ? t('record_return') : t('record_pay')}
                    </button>
                  )}
                </div>
                {loan.outstanding > 0 && (
                  <p className={`text-xs font-semibold mt-2 ${isLent ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {isLent ? t('still_outstanding') : t('still_to_repay')} ฿{fmt(loan.outstanding)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmModal
        open={confirmState.open}
        message={t('delete_confirm')}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(s => ({ ...s, open: false }))}
      />

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-card rounded-3xl p-6 space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base-theme">{form.direction === 'lent' ? t('record_lend_modal') : t('record_borrow_modal')}</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 text-muted-theme"><Icon path={mdiClose} size={0.9} /></button>
            </div>

            {/* Direction selector */}
            <div className="flex gap-2">
              {(['lent', 'borrowed'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setForm(f => ({ ...f, direction: d }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors
                    ${form.direction === d
                      ? d === 'lent' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                      : 'bg-[var(--input)] text-muted-theme'}`}
                >
                  {d === 'lent' ? t('lent_arrow') : t('borrowed_arrow')}
                </button>
              ))}
            </div>

            <input
              placeholder={form.direction === 'lent' ? t('borrower_name') : t('lender_name')}
              value={form.borrower}
              onChange={e => setForm(f => ({ ...f, borrower: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none"
            />
            <input
              type="number" step="0.01" placeholder={t('amount_baht')}
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none"
            />
            <input
              placeholder={t('note_optional')}
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none"
            />
            <div>
              <label className="text-xs text-muted-theme mb-1 block">{t('date')}</label>
              <input
                type="date" value={form.lentAt}
                onChange={e => setForm(f => ({ ...f, lentAt: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={saving || !form.borrower || !form.amount}
              className={`w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50
                ${form.direction === 'lent' ? 'bg-amber-500' : 'bg-rose-500'}`}
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-card rounded-3xl p-6 space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base-theme">{t('record_payment_modal')}</h2>
              <button onClick={() => setShowPayment(null)} className="p-1 text-muted-theme"><Icon path={mdiClose} size={0.9} /></button>
            </div>
            <input
              type="number" step="0.01" placeholder={t('amount_label')}
              value={payForm.amount}
              onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none"
            />
            <div>
              <label className="text-xs text-muted-theme mb-1 block">{t('payment_date')}</label>
              <input
                type="date" value={payForm.paidAt}
                onChange={e => setPayForm(f => ({ ...f, paidAt: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none"
              />
            </div>
            <input
              placeholder={t('note_optional')}
              value={payForm.note}
              onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none"
            />
            <button
              onClick={handlePayment}
              disabled={saving || !payForm.amount}
              className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm disabled:opacity-50"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
