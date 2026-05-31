import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiChevronLeft, mdiCalendar, mdiCheckCircle,
  mdiWallet, mdiCash, mdiInformationOutline,
} from '@mdi/js'
import clsx from 'clsx'
import { expensesApi } from '../../api'
import { useCategories, useAllocations } from '../../hooks'
import { IconDisplay } from '../../components/ui'
import { useT } from '../../store/i18n.store'
import type { EntryType } from '../../types'

const QUICK = [5, 10, 20, 50, 100, 200, 500, 1000]

export default function AddExpense() {
  const navigate = useNavigate()
  const t = useT()
  const { data: categories, loading: loadingCats } = useCategories()
  const { data: allocations }                       = useAllocations()

  const [type,       setType]   = useState<EntryType>('expense')
  const [amount,     setAmount] = useState('')
  const [categoryId, setCatId]  = useState('')
  const [note,       setNote]   = useState('')
  const [occurredAt, setDate]   = useState(() => new Date().toISOString().slice(0, 10))
  const [submitting, setSubmit] = useState(false)
  const [success,    setSuccess]= useState(false)

  const filteredCats = categories?.filter(c => c.type === type) ?? []

  // For expense: find which wallet will be debited
  const linkedAlloc = type === 'expense' && categoryId
    ? allocations?.find(a => a.categories.some(c => c.id === categoryId))
    : null

  // For income: find which wallet will be credited
  const linkedIncomeAlloc = type === 'income' && categoryId
    ? allocations?.find(a => a.incomeCategories?.some(c => c.id === categoryId))
    : null

  const handleTypeChange = (tp: EntryType) => { setType(tp); setCatId('') }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!amount || !categoryId) return
    setSubmit(true)
    try {
      await expensesApi.create({
        categoryId,
        amount: Number(amount),
        type,
        // Income no longer requires allocationId — it parks in total balance
        note: note || undefined,
        occurredAt: new Date(occurredAt).toISOString(),
      })
      setSuccess(true)
      setTimeout(() => navigate('/'), 900)
    } catch { setSubmit(false) }
  }

  if (success) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in bg-app">
      <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
        <Icon path={mdiCheckCircle} size={2.2} color="#10b981" />
      </div>
      <p className="text-lg font-bold text-base-theme">{t('saved')}</p>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-app">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 active:bg-slate-200 transition-colors">
          <Icon path={mdiChevronLeft} size={0.9} className="text-base-theme" />
        </button>
        <h1 className="text-lg font-bold text-base-theme">{t('add_transaction')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pb-6 space-y-5">

        {/* Type toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 gap-1">
          {(['expense', 'income'] as EntryType[]).map(tp => (
            <button key={tp} type="button" onClick={() => handleTypeChange(tp)}
              className={clsx(
                'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5',
                type === tp
                  ? tp === 'expense'
                    ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-sm'
                    : 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm'
                  : 'text-muted-theme',
              )}>
              <Icon path={tp === 'expense' ? mdiWallet : mdiCash} size={0.65} />
              {tp === 'expense' ? t('expense') : t('income_tab')}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="bg-card rounded-2xl border border-theme shadow-sm px-5 py-4">
          <label className="text-xs font-semibold text-muted-theme block mb-2 uppercase tracking-wide">
            {t('amount')}
          </label>
          <input
            type="number" inputMode="decimal" placeholder="0" value={amount}
            onChange={e => setAmount(e.target.value)} required min={0}
            className="w-full text-4xl font-extrabold text-base-theme bg-transparent
                       outline-none placeholder:text-slate-200 dark:placeholder:text-slate-600 tracking-tight"
          />
          <div className="flex gap-2 mt-3 flex-wrap">
            {QUICK.map(v => (
              <button key={v} type="button"
                onClick={() => setAmount(p => p ? String(Number(p) + v) : String(v))}
                className="px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600
                           text-xs font-semibold active:bg-brand-100 transition-colors">
                +{v}
              </button>
            ))}
            <button type="button" onClick={() => setAmount('')}
              className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-muted-theme
                         text-xs font-semibold transition-colors">
              Clear
            </button>
          </div>
        </div>

        {/* Income: wallet credit preview (if category linked) or general info */}
        {type === 'income' && categoryId && (
          <div className={clsx(
            'rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-up',
            linkedIncomeAlloc
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800'
              : 'bg-slate-50 dark:bg-slate-800 border border-theme',
          )}>
            <Icon path={mdiWallet} size={0.8} color={linkedIncomeAlloc ? '#10b981' : '#94a3b8'} />
            {linkedIncomeAlloc ? (
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  {t('will_credit')}
                  <IconDisplay icon={linkedIncomeAlloc.icon} size="sm" />
                  {linkedIncomeAlloc.name}
                </p>
                <p className="text-[10px] text-emerald-500 mt-0.5">
                  {t('income_linked_info')}
                  {amount && Number(amount) > 0 && (
                    <span className="ml-1 text-emerald-400">
                      ฿{Number(linkedIncomeAlloc.balance).toLocaleString()} → ฿{(Number(linkedIncomeAlloc.balance) + Number(amount)).toLocaleString()} {t('after')}
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-theme font-medium">{t('income_park_info')}</p>
            )}
          </div>
        )}
        {type === 'income' && !categoryId && (
          <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-900/20
                          border border-emerald-100 dark:border-emerald-800
                          rounded-2xl px-4 py-3 animate-fade-up">
            <Icon path={mdiInformationOutline} size={0.8} color="#10b981" className="flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium leading-relaxed">
              {t('income_park_info')}
            </p>
          </div>
        )}

        {/* Categories */}
        <div>
          <label className="text-xs font-semibold text-muted-theme block mb-2 uppercase tracking-wide px-1">
            {t('category')}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {loadingCats
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
                ))
              : filteredCats.map(cat => (
                  <button key={cat.id} type="button" onClick={() => setCatId(cat.id)}
                    className={clsx(
                      'flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border-2 transition-all bg-card',
                      categoryId === cat.id
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 shadow-sm'
                        : 'border-transparent',
                    )}>
                    <div className="w-8 h-8 flex items-center justify-center rounded-xl">
                      <IconDisplay icon={cat.icon} color={cat.color} size="lg" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-theme leading-tight text-center px-1 truncate w-full">
                      {cat.name}
                    </span>
                  </button>
                ))
            }
          </div>
        </div>

        {/* Expense: wallet deduction preview */}
        {type === 'expense' && categoryId && (
          <div className={clsx(
            'rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-up',
            linkedAlloc
              ? 'bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-800'
              : 'bg-slate-50 dark:bg-slate-800 border border-theme',
          )}>
            <Icon path={mdiWallet} size={0.8} color={linkedAlloc ? '#4f46e5' : '#94a3b8'} />
            {linkedAlloc ? (
              <div>
                <p className="text-xs font-semibold text-brand-700 dark:text-brand-300 flex items-center gap-1">
                  {t('will_deduct')} 
                  <IconDisplay icon={linkedAlloc.icon} size="sm" />
                  {linkedAlloc.name}
                </p>
                <p className="text-[10px] text-brand-400 mt-0.5">
                  {t('current_balance')} ฿{Number(linkedAlloc.balance).toLocaleString()}
                  {amount && Number(amount) > 0 && (
                    <span className="ml-1 text-rose-400">
                      → ฿{(Number(linkedAlloc.balance) - Number(amount)).toLocaleString()} {t('after')}
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-theme font-medium">{t('no_wallet_linked')}</p>
            )}
          </div>
        )}

        {/* Date */}
        <div className="bg-card rounded-2xl border border-theme shadow-sm px-5 py-4">
          <label className="text-xs font-semibold text-muted-theme block mb-2 uppercase tracking-wide">
            {t('date')}
          </label>
          <div className="flex items-center gap-3">
            <Icon path={mdiCalendar} size={0.8} color="#818cf8" />
            <input type="date" value={occurredAt} onChange={e => setDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)} required
              className="flex-1 text-base-theme font-semibold bg-transparent outline-none" />
          </div>
        </div>

        {/* Note */}
        <div className="bg-card rounded-2xl border border-theme shadow-sm px-5 py-4">
          <label className="text-xs font-semibold text-muted-theme block mb-2 uppercase tracking-wide">
            {t('note_optional')}
          </label>
          <input type="text" placeholder={t('note_placeholder')} value={note}
            onChange={e => setNote(e.target.value)} maxLength={200}
            className="w-full text-base-theme font-medium bg-transparent outline-none placeholder:text-muted-theme" />
        </div>

        {/* Submit — income no longer blocked by wallet selection */}
        <button type="submit"
          disabled={submitting || !amount || !categoryId}
          className={clsx(
            'w-full py-4 rounded-2xl font-bold text-white text-base transition-all',
            'active:scale-[0.98] shadow-lg',
            submitting || !amount || !categoryId
              ? 'bg-slate-300 dark:bg-slate-700 shadow-none cursor-not-allowed'
              : type === 'expense'
                ? 'bg-brand-600 shadow-brand-500/30'
                : 'bg-emerald-500 shadow-emerald-500/30',
          )}>
          {submitting ? t('saving') : type === 'expense' ? t('save_expense') : t('save_income')}
        </button>
      </form>
    </div>
  )
}