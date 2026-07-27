import { useState, useEffect, useCallback } from 'react'
import { budgetsApi, categoriesApi } from '../../api'
import type { BudgetItem, Category } from '../../types'
import Icon from '@mdi/react'
import { mdiPlus, mdiTrashCanOutline, mdiPencilOutline, mdiClose, mdiCheck } from '@mdi/js'
import CustomSelect from '../../components/ui/CustomSelect'
import IconDisplay from '../../components/ui/IconDisplay'
import { useT, useI18n } from '../../store/i18n.store'
import ConfirmModal from '../../components/ui/ConfirmModal'
import { currentMonthLocal as currentMonth } from '../../utils/localDate'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Budget() {
  const t = useT()
  const lang = useI18n(s => s.lang)
  const dateLocale = lang === 'en' ? 'en-US' : 'th-TH'
  const [month, setMonth] = useState(currentMonth())
  const [budgets, setBudgets] = useState<BudgetItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ categoryId: '', amount: '' })
  const [saving, setSaving] = useState(false)
  const [confirmState, setConfirmState] = useState<{ open: boolean; onConfirm: () => void }>({ open: false, onConfirm: () => {} })

  const load = useCallback(async () => {
    setLoading(true)
    const [b, c] = await Promise.all([budgetsApi.getWithActual(month), categoriesApi.list()])
    setBudgets(b)
    setCategories(c.filter((x: Category) => x.type === 'expense'))
    setLoading(false)
  }, [month])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = (e: Event) => {
      const types: string[] = (e as CustomEvent).detail?.types ?? []
      if (types.includes('budget') || types.includes('dashboard')) load()
    }
    window.addEventListener('moneyflow:refresh', handler)
    return () => window.removeEventListener('moneyflow:refresh', handler)
  }, [load])

  const totalBudgeted = budgets.reduce((s, b) => s + b.budgeted, 0)
  const totalActual   = budgets.reduce((s, b) => s + b.actual, 0)

  const handleSave = async () => {
    if (!form.categoryId || !form.amount) return
    setSaving(true)
    await budgetsApi.upsert({ categoryId: form.categoryId, amount: parseFloat(form.amount), month })
    setShowForm(false)
    setForm({ categoryId: '', amount: '' })
    await load()
    setSaving(false)
  }

  const handleDelete = (id: string) => {
    setConfirmState({
      open: true,
      onConfirm: async () => {
        setConfirmState(s => ({ ...s, open: false }))
        await budgetsApi.remove(id)
        await load()
      },
    })
  }

  const changeMonth = (dir: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + dir, 1)
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (newMonth <= currentMonth()) setMonth(newMonth)
  }

  const usedCategoryIds = new Set(budgets.map(b => b.categoryId))
  const availableCategories = categories.filter(c => !usedCategoryIds.has(c.id))

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-base-theme">{t('budget_title')}</h1>
          <p className="text-xs text-muted-theme mt-0.5">{t('budget_subtitle')}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold
                     active:scale-95 transition-transform"
        >
          <Icon path={mdiPlus} size={0.8} />
          {t('add')}
        </button>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-[var(--input)] text-muted-theme">‹</button>
        <span className="font-bold text-base-theme text-sm min-w-[100px] text-center">
          {new Date(month + '-01').toLocaleDateString(dateLocale, { year: 'numeric', month: 'long' })}
        </span>
        <button
          onClick={() => changeMonth(1)}
          disabled={month >= currentMonth()}
          className="p-2 rounded-full hover:bg-[var(--input)] text-muted-theme disabled:opacity-30"
        >›</button>
      </div>

      {/* Summary card */}
      <div className="bg-card rounded-2xl border border-[var(--border)] p-4">
        <div className="flex justify-between text-sm mb-3">
          <span className="text-muted-theme">{t('budget_total')}</span>
          <span className="font-bold text-base-theme">฿{fmt(totalBudgeted)}</span>
        </div>
        <div className="w-full bg-[var(--input)] rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${totalActual > totalBudgeted ? 'bg-red-500' : 'bg-brand-500'}`}
            style={{ width: `${totalBudgeted > 0 ? Math.min(100, (totalActual / totalBudgeted) * 100) : 0}%` }}
          />
        </div>
        <div className="flex justify-between text-xs mt-2 text-muted-theme">
          <span>{t('spent')} ฿{fmt(totalActual)}</span>
          <span className={totalActual > totalBudgeted ? 'text-red-500 font-semibold' : 'text-emerald-500 font-semibold'}>
            {totalActual > totalBudgeted ? `${t('budget_over')} ฿${fmt(totalActual - totalBudgeted)}` : `${t('budget_left')} ฿${fmt(totalBudgeted - totalActual)}`}
          </span>
        </div>
      </div>

      {/* Budget list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-card rounded-2xl animate-pulse border border-[var(--border)]" />)}
        </div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-12 text-muted-theme">
          <div className="text-4xl mb-2">📊</div>
          <p className="font-semibold">{t('no_budget')}</p>
          <p className="text-sm mt-1">{t('add_budget_hint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map(b => {
            const pct = b.budgeted > 0 ? Math.min(100, (b.actual / b.budgeted) * 100) : 0
            const over = b.actual > b.budgeted
            return (
              <div key={b.id} className="bg-card rounded-2xl border border-[var(--border)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0"
                      style={{ backgroundColor: (b.categoryColor ?? '#94a3b8') + '22' }}>
                      <IconDisplay icon={b.categoryIcon} color={b.categoryColor} size="md" />
                    </span>
                    <span className="font-semibold text-base-theme text-sm">{b.categoryName}</span>
                  </div>
                  <button onClick={() => handleDelete(b.id)} className="p-1 text-muted-theme hover:text-red-500 transition-colors">
                    <Icon path={mdiTrashCanOutline} size={0.75} />
                  </button>
                </div>
                <div className="w-full bg-[var(--input)] rounded-full h-2 overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-theme">
                  <span>{t('budget_used')} ฿{fmt(b.actual)}</span>
                  <span>{t('budget_set')} ฿{fmt(b.budgeted)}</span>
                </div>
                {over && (
                  <p className="text-xs text-red-500 font-semibold mt-1">{t('budget_over_by')} ฿{fmt(b.actual - b.budgeted)}</p>
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

      {/* Add form modal */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-card rounded-3xl p-6 space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base-theme">{t('set_budget')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-muted-theme">
                <Icon path={mdiClose} size={0.9} />
              </button>
            </div>
            <CustomSelect
              value={form.categoryId}
              onChange={v => setForm(f => ({ ...f, categoryId: v }))}
              placeholder={t('select_category')}
              options={availableCategories.map(c => ({ value: c.id, label: c.name, icon: c.icon, color: c.color }))}
            />
            <input
              type="number"
              step="0.01"
              placeholder={t('amount_baht')}
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none"
            />
            <button
              onClick={handleSave}
              disabled={saving || !form.categoryId || !form.amount}
              className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-sm disabled:opacity-50"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
