import { useState, useEffect, useCallback } from 'react'
import { investmentsApi } from '../../api'
import type { Investment } from '../../types'
import Icon from '@mdi/react'
import { mdiPlus, mdiTrashCanOutline, mdiTrendingUp, mdiClose } from '@mdi/js'
import CustomSelect from '../../components/ui/CustomSelect'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TYPE_LABELS: Record<string, string> = {
  mutual_fund: 'กองทุนรวม', stock_th: 'หุ้นไทย', stock_us: 'หุ้นต่างประเทศ',
  crypto: 'คริปโต', gold: 'ทองคำ', other: 'อื่นๆ',
}

export default function Investments() {
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showTx, setShowTx] = useState<string | null>(null)
  const [invForm, setInvForm] = useState({ name: '', symbol: '', type: 'mutual_fund', note: '' })
  const [txForm, setTxForm] = useState({ type: 'buy', amount: '', units: '', navPrice: '', occurredAt: new Date().toISOString().slice(0, 10), note: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setInvestments(await investmentsApi.findAll())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-base-theme">การลงทุน</h1>
          <p className="text-xs text-muted-theme mt-0.5">ติดตามพอร์ตและต้นทุน</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold active:scale-95 transition-transform">
          <Icon path={mdiPlus} size={0.8} />
          เพิ่ม
        </button>
      </div>

      {/* Summary */}
      <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-2xl p-4 border border-cyan-200 dark:border-cyan-800">
        <div className="flex items-center gap-3">
          <Icon path={mdiTrendingUp} size={1.2} color="#06b6d4" />
          <div>
            <p className="text-xs text-cyan-700 dark:text-cyan-300 font-medium">ต้นทุนสุทธิทั้งหมด</p>
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
          <p className="font-semibold">ยังไม่มีข้อมูลการลงทุน</p>
          <p className="text-sm mt-1">กด + เพื่อเพิ่มกองทุนหรือหุ้น</p>
        </div>
      ) : (
        <div className="space-y-3">
          {investments.map(inv => (
            <div key={inv.id} className="bg-card rounded-2xl border border-[var(--border)] p-4">
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
                  <p className="text-[10px] text-muted-theme">ต้นทุนสุทธิ</p>
                  <p className="text-sm font-bold text-base-theme">฿{fmt(inv.netCost)}</p>
                </div>
                <div className="text-center bg-[var(--input)] rounded-xl p-2">
                  <p className="text-[10px] text-muted-theme">จำนวนหน่วย</p>
                  <p className="text-sm font-bold text-base-theme">{inv.totalUnits.toFixed(4)}</p>
                </div>
                <div className="text-center bg-[var(--input)] rounded-xl p-2">
                  <p className="text-[10px] text-muted-theme">รายการ</p>
                  <p className="text-sm font-bold text-base-theme">{inv.transactions.length}</p>
                </div>
              </div>
              <button onClick={() => setShowTx(inv.id)}
                className="w-full py-2 rounded-xl border border-[var(--border)] text-sm font-semibold text-muted-theme hover:text-base-theme transition-colors">
                + เพิ่มรายการซื้อ/ขาย
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Investment Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-card rounded-3xl p-6 space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base-theme">เพิ่มการลงทุน</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 text-muted-theme"><Icon path={mdiClose} size={0.9} /></button>
            </div>
            <input placeholder="ชื่อกองทุน/หุ้น" value={invForm.name} onChange={e => setInvForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <input placeholder="Symbol (เช่น SCBS&P500)" value={invForm.symbol} onChange={e => setInvForm(f => ({ ...f, symbol: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <CustomSelect
              value={invForm.type}
              onChange={v => setInvForm(f => ({ ...f, type: v }))}
              options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
            <button onClick={handleCreateInv} disabled={saving || !invForm.name}
              className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-sm disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'เพิ่ม'}
            </button>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showTx && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-card rounded-3xl p-6 space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base-theme">บันทึกรายการ</h2>
              <button onClick={() => setShowTx(null)} className="p-1 text-muted-theme"><Icon path={mdiClose} size={0.9} /></button>
            </div>
            <CustomSelect
              value={txForm.type}
              onChange={v => setTxForm(f => ({ ...f, type: v }))}
              options={[
                { value: 'buy', label: 'ซื้อ' },
                { value: 'sell', label: 'ขาย' },
                { value: 'dividend', label: 'เงินปันผล' },
              ]}
            />
            <input type="number" placeholder="จำนวนเงิน (บาท)" value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <input type="number" placeholder="จำนวนหน่วย (ไม่บังคับ)" value={txForm.units} onChange={e => setTxForm(f => ({ ...f, units: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <input type="number" placeholder="NAV ต่อหน่วย (ไม่บังคับ)" value={txForm.navPrice} onChange={e => setTxForm(f => ({ ...f, navPrice: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <div>
              <label className="text-xs text-muted-theme mb-1 block">วันที่</label>
              <input type="date" value={txForm.occurredAt} onChange={e => setTxForm(f => ({ ...f, occurredAt: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            </div>
            <button onClick={handleAddTx} disabled={saving || !txForm.amount}
              className="w-full py-3 rounded-xl bg-cyan-500 text-white font-bold text-sm disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
