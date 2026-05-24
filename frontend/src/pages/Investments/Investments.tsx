import { useState, useEffect, useCallback } from 'react'
import { investmentsApi } from '../../api'
import type { Investment } from '../../types'
import Icon from '@mdi/react'
import { mdiPlus, mdiTrashCanOutline, mdiTrendingUp, mdiClose, mdiChevronDown, mdiChevronUp } from '@mdi/js'
import CustomSelect from '../../components/ui/CustomSelect'
import { useT, useI18n } from '../../store/i18n.store'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TX_COLOR: Record<string, string> = {
  buy: 'text-emerald-500',
  sell: 'text-red-400',
  dividend: 'text-amber-400',
}

export default function Investments() {
  const t = useT()
  const lang = useI18n(s => s.lang)
  const dateLocale = lang === 'en' ? 'en-US' : 'th-TH'

  const TX_LABEL: Record<string, string> = { buy: t('tx_buy'), sell: t('tx_sell'), dividend: t('tx_dividend') }
  const TYPE_LABELS: Record<string, string> = {
    mutual_fund: t('inv_mutual_fund'), stock_th: t('inv_stock_th'), stock_us: t('inv_stock_us'),
    crypto: t('inv_crypto'), gold: t('inv_gold'), other: t('inv_other'),
  }

  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showTx, setShowTx] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [invForm, setInvForm] = useState({ name: '', symbol: '', type: 'mutual_fund', note: '' })
  const [txForm, setTxForm] = useState({ type: 'buy', amount: '', units: '', navPrice: '', occurredAt: new Date().toISOString().slice(0, 10), note: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setInvestments(await investmentsApi.findAll())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = (e: Event) => {
      const types: string[] = (e as CustomEvent).detail?.types ?? []
      if (types.includes('investments')) load()
    }
    window.addEventListener('moneyflow:refresh', handler)
    return () => window.removeEventListener('moneyflow:refresh', handler)
  }, [load])

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const totalNetCost = investments.reduce((s, i) => s + i.netCost, 0)

  const handleCreateInv = async () => {
    if (!invForm.name) return
    setSaving(true)
    await investmentsApi.create(invForm)
    setShowAdd(false)
    setInvForm({ name: '', symbol: '', type: 'mutual_fund', note: '' })
    await load()
    setSaving(false)
  }

  const handleAddTx = async () => {
    if (!showTx || !txForm.amount) return
    setSaving(true)
    await investmentsApi.addTransaction(showTx, {
      type: txForm.type,
      amount: parseFloat(txForm.amount),
      units: txForm.units ? parseFloat(txForm.units) : undefined,
      navPrice: txForm.navPrice ? parseFloat(txForm.navPrice) : undefined,
      occurredAt: txForm.occurredAt,
      note: txForm.note || undefined,
    })
    setShowTx(null)
    setTxForm({ type: 'buy', amount: '', units: '', navPrice: '', occurredAt: new Date().toISOString().slice(0, 10), note: '' })
    await load()
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    await investmentsApi.remove(id)
    await load()
  }

  const handleDeleteTx = async (txId: string) => {
    await investmentsApi.removeTransaction(txId)
    await load()
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-base-theme">{t('investments_title')}</h1>
          <p className="text-xs text-muted-theme mt-0.5">{t('investments_subtitle')}</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold active:scale-95 transition-transform">
          <Icon path={mdiPlus} size={0.8} />
          {t('add')}
        </button>
      </div>

      {/* Summary */}
      <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-2xl p-4 border border-cyan-200 dark:border-cyan-800">
        <div className="flex items-center gap-3">
          <Icon path={mdiTrendingUp} size={1.2} color="#06b6d4" />
          <div>
            <p className="text-xs text-cyan-700 dark:text-cyan-300 font-medium">{t('total_net_cost')}</p>
            <p className="text-2xl font-extrabold text-cyan-800 dark:text-cyan-200">฿{fmt(totalNetCost)}</p>
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-28 bg-card rounded-2xl animate-pulse border border-[var(--border)]" />)}</div>
      ) : investments.length === 0 ? (
        <div className="text-center py-12 text-muted-theme">
          <div className="text-4xl mb-2">📈</div>
          <p className="font-semibold">{t('no_investments')}</p>
          <p className="text-sm mt-1">{t('add_investment_hint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {investments.map(inv => {
            const isExpanded = expanded.has(inv.id)
            const toggle = () => setExpanded(prev => {
              const next = new Set(prev)
              next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id)
              return next
            })
            const sorted = [...inv.transactions].sort(
              (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
            )
            return (
              <div key={inv.id} className="bg-card rounded-2xl border border-[var(--border)] overflow-hidden">
                {/* Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-base-theme">{inv.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {inv.symbol && <span className="text-xs bg-[var(--input)] text-muted-theme px-2 py-0.5 rounded-full font-mono">{inv.symbol}</span>}
                        <span className="text-xs text-muted-theme">{TYPE_LABELS[inv.type] ?? inv.type}</span>
                      </div>
                    </div>
                    <button onClick={() => handleDelete(inv.id)} className="p-1 text-muted-theme hover:text-red-500">
                      <Icon path={mdiTrashCanOutline} size={0.75} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center bg-[var(--input)] rounded-xl p-2">
                      <p className="text-[10px] text-muted-theme">{t('net_cost')}</p>
                      <p className="text-sm font-bold text-base-theme">฿{fmt(inv.netCost)}</p>
                    </div>
                    <div className="text-center bg-[var(--input)] rounded-xl p-2">
                      <p className="text-[10px] text-muted-theme">{t('total_units')}</p>
                      <p className="text-sm font-bold text-base-theme">{inv.totalUnits.toFixed(4)}</p>
                    </div>
                    <button
                      onClick={toggle}
                      className="text-center bg-[var(--input)] rounded-xl p-2 cursor-pointer hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                    >
                      <p className="text-[10px] text-muted-theme">{t('transactions')}</p>
                      <p className="text-sm font-bold text-base-theme flex items-center justify-center gap-1">
                        {inv.transactions.length}
                        {inv.transactions.length > 0 && (
                          <Icon path={isExpanded ? mdiChevronUp : mdiChevronDown} size={0.6} />
                        )}
                      </p>
                    </button>
                  </div>
                  <button onClick={() => setShowTx(inv.id)}
                    className="w-full py-2 rounded-xl border border-[var(--border)] text-sm font-semibold text-muted-theme hover:text-base-theme transition-colors">
                    {t('add_buy_sell')}
                  </button>
                </div>

                {/* Transaction history */}
                {isExpanded && sorted.length > 0 && (
                  <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                    {sorted.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--input)] ${TX_COLOR[tx.type]}`}>
                            {TX_LABEL[tx.type]}
                          </span>
                          <div>
                            <p className="text-xs text-muted-theme">{fmtDate(tx.occurredAt)}</p>
                            {tx.note && <p className="text-[10px] text-muted-theme/70">{tx.note}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className={`text-sm font-bold ${TX_COLOR[tx.type]}`}>
                              {tx.type === 'sell' ? '-' : '+'}฿{fmt(Number(tx.amount))}
                            </p>
                            {tx.units != null && Number(tx.units) > 0 && (
                              <p className="text-[10px] text-muted-theme">
                                {Number(tx.units).toFixed(4)} {t('unit_suffix')}
                                {tx.navPrice != null && ` @ ฿${Number(tx.navPrice)}`}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteTx(tx.id)}
                            className="p-1 text-muted-theme hover:text-red-500 transition-colors"
                          >
                            <Icon path={mdiTrashCanOutline} size={0.65} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Investment Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-card rounded-3xl p-6 space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base-theme">{t('add_investment')}</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 text-muted-theme"><Icon path={mdiClose} size={0.9} /></button>
            </div>
            <input placeholder={t('fund_stock_name')} value={invForm.name} onChange={e => setInvForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <input placeholder="Symbol (เช่น SCBS&P500)" value={invForm.symbol} onChange={e => setInvForm(f => ({ ...f, symbol: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <CustomSelect
              value={invForm.type}
              onChange={v => setInvForm(f => ({ ...f, type: v }))}
              options={Object.entries(TYPE_LABELS).map(([v, label]) => ({ value: v, label }))}
            />
            <button onClick={handleCreateInv} disabled={saving || !invForm.name}
              className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-sm disabled:opacity-50">
              {saving ? t('saving') : t('add')}
            </button>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showTx && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-card rounded-3xl p-6 space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base-theme">{t('record_inv_tx')}</h2>
              <button onClick={() => setShowTx(null)} className="p-1 text-muted-theme"><Icon path={mdiClose} size={0.9} /></button>
            </div>
            <CustomSelect
              value={txForm.type}
              onChange={v => setTxForm(f => ({ ...f, type: v }))}
              options={[
                { value: 'buy', label: t('tx_buy') },
                { value: 'sell', label: t('tx_sell') },
                { value: 'dividend', label: t('tx_dividend') },
              ]}
            />
            <input type="number" placeholder={t('amount_baht')} value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <input type="number" placeholder={t('units_optional')} value={txForm.units} onChange={e => setTxForm(f => ({ ...f, units: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <input type="number" placeholder={t('nav_optional')} value={txForm.navPrice} onChange={e => setTxForm(f => ({ ...f, navPrice: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <div>
              <label className="text-xs text-muted-theme mb-1 block">{t('date')}</label>
              <input type="date" value={txForm.occurredAt} onChange={e => setTxForm(f => ({ ...f, occurredAt: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            </div>
            <button onClick={handleAddTx} disabled={saving || !txForm.amount}
              className="w-full py-3 rounded-xl bg-cyan-500 text-white font-bold text-sm disabled:opacity-50">
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
