import { useState, useEffect, useCallback } from 'react'
import { taxApi } from '../../api'
import type { TaxDeduction, TaxCalculationResult, TaxDeductionType } from '../../types'
import Icon from '@mdi/react'
import { mdiPlus, mdiTrashCanOutline, mdiClose, mdiLightbulbOutline, mdiReceiptTextOutline } from '@mdi/js'
import CustomSelect from '../../components/ui/CustomSelect'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function Tax() {
  const year = new Date().getFullYear()
  const [income, setIncome] = useState('')
  const [deductions, setDeductions] = useState<TaxDeduction[]>([])
  const [types, setTypes] = useState<TaxDeductionType[]>([])
  const [result, setResult] = useState<TaxCalculationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ type: '', amount: '', note: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [d, t] = await Promise.all([taxApi.findByYear(year), taxApi.getTypes()])
    setDeductions(d)
    setTypes(t)
  }, [year])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = (e: Event) => {
      const types: string[] = (e as CustomEvent).detail?.types ?? []
      if (types.includes('tax')) load()
    }
    window.addEventListener('moneyflow:refresh', handler)
    return () => window.removeEventListener('moneyflow:refresh', handler)
  }, [load])

  const handleCalculate = async () => {
    if (!income) return
    setLoading(true)
    const r = await taxApi.calculate(parseFloat(income), year)
    setResult(r)
    setLoading(false)
  }

  const handleAddDeduction = async () => {
    if (!form.type || !form.amount) return
    setSaving(true)
    const typeInfo = types.find(t => t.type === form.type)
    await taxApi.upsert({
      taxYear: year, type: form.type,
      name: typeInfo?.name ?? form.type,
      amount: parseFloat(form.amount),
      maxAmount: typeInfo?.max || undefined,
      note: form.note || undefined,
    })
    setShowAdd(false)
    setForm({ type: '', amount: '', note: '' })
    await load()
    if (income) await handleCalculate()
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    await taxApi.remove(id)
    await load()
    if (income) await handleCalculate()
  }

  const selectedType = types.find(t => t.type === form.type)

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-base-theme">วางแผนภาษี</h1>
          <p className="text-xs text-muted-theme mt-0.5">ภาษีเงินได้บุคคลธรรมดา ปี {year + 543}</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold active:scale-95 transition-transform">
          <Icon path={mdiPlus} size={0.8} />
          ค่าลดหย่อน
        </button>
      </div>

      {/* Income input + calculate */}
      <div className="bg-card rounded-2xl border border-[var(--border)] p-4 space-y-3">
        <p className="text-sm font-semibold text-base-theme">รายได้ต่อปี</p>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="เช่น 600000"
            value={income}
            onChange={e => setIncome(e.target.value)}
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none"
          />
          <button onClick={handleCalculate} disabled={!income || loading}
            className="px-4 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm disabled:opacity-50 shrink-0">
            {loading ? '...' : 'คำนวณ'}
          </button>
        </div>
      </div>

      {/* Tax result */}
      {result && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Icon path={mdiReceiptTextOutline} size={0.9} color="#10b981" />
            <span className="font-bold text-emerald-800 dark:text-emerald-200 text-sm">ผลการคำนวณภาษี</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'รายได้พึงประเมิน', value: `฿${fmt(result.annualIncome)}` },
              { label: 'หักค่าใช้จ่าย', value: `฿${fmt(result.employmentDeduction)}` },
              { label: 'ค่าลดหย่อนรวม', value: `฿${fmt(result.totalDeductions)}` },
              { label: 'เงินได้สุทธิ', value: `฿${fmt(result.netIncome)}` },
            ].map(item => (
              <div key={item.label} className="bg-white dark:bg-emerald-900/30 rounded-xl p-3">
                <p className="text-[10px] text-muted-theme">{item.label}</p>
                <p className="font-bold text-base-theme text-sm">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-emerald-900/30 rounded-xl p-3 text-center">
            <p className="text-xs text-muted-theme">ภาษีที่ต้องชำระ</p>
            <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">฿{fmt(result.tax)}</p>
            <p className="text-xs text-muted-theme mt-0.5">อัตราภาษีที่แท้จริง {result.effectiveRate.toFixed(2)}%</p>
          </div>

          {/* Optimizations */}
          {result.optimizations.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                <Icon path={mdiLightbulbOutline} size={0.8} />
                <span className="text-xs font-bold">AI แนะนำ: วิธีลดภาษี</span>
              </div>
              {result.optimizations.map(opt => (
                <div key={opt.type} className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{opt.name}</p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{opt.description}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-[10px] text-muted-theme">ประหยัดได้</p>
                      <p className="text-sm font-bold text-emerald-600">฿{fmt(opt.estimatedTaxSaving)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Deductions list */}
      <div>
        <h2 className="font-bold text-base-theme text-sm mb-3">ค่าลดหย่อนที่บันทึกไว้ ({year + 543})</h2>
        {deductions.length === 0 ? (
          <div className="text-center py-8 text-muted-theme">
            <div className="text-3xl mb-2">📝</div>
            <p className="text-sm">ยังไม่มีค่าลดหย่อน กด + เพื่อเพิ่ม</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deductions.map(d => {
              const typeInfo = types.find(t => t.type === d.type)
              const pct = typeInfo?.max && typeInfo.max > 0 ? Math.min(100, (d.amount / typeInfo.max) * 100) : 0
              return (
                <div key={d.id} className="bg-card rounded-2xl border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-base-theme text-sm">{d.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base-theme text-sm">฿{fmt(d.amount)}</span>
                      <button onClick={() => handleDelete(d.id)} className="p-1 text-muted-theme hover:text-red-500">
                        <Icon path={mdiTrashCanOutline} size={0.7} />
                      </button>
                    </div>
                  </div>
                  {typeInfo?.max && typeInfo.max > 0 && (
                    <>
                      <div className="w-full bg-[var(--input)] rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-theme mt-0.5">สูงสุด ฿{fmt(typeInfo.max)}</p>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add deduction modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-card rounded-3xl p-6 space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base-theme">เพิ่มค่าลดหย่อน</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 text-muted-theme"><Icon path={mdiClose} size={0.9} /></button>
            </div>
            <CustomSelect
              value={form.type}
              onChange={v => setForm(f => ({ ...f, type: v }))}
              placeholder="เลือกประเภท"
              options={types.map(t => ({ value: t.type, label: t.name }))}
            />
            {selectedType && (
              <p className="text-xs text-muted-theme -mt-2 px-1">{selectedType.description}</p>
            )}
            <input type="number" placeholder={`จำนวนเงิน${selectedType?.max ? ` (สูงสุด ฿${fmt(selectedType.max)})` : ''}`}
              value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none" />
            <button onClick={handleAddDeduction} disabled={saving || !form.type || !form.amount}
              className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-sm disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
