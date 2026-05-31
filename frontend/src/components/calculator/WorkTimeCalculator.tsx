import { useState } from 'react'
import Icon from '@mdi/react'
import { mdiClose, mdiContentSave, mdiCog, mdiPencilOutline, mdiClockMinusOutline  } from '@mdi/js'

interface WorkSettings {
  salary: number
  hoursPerDay: number
  workDaysPerMonth: number
}

const STORAGE_KEY = 'wt_settings'
const DEFAULTS: WorkSettings = { salary: 30000, hoursPerDay: 8, workDaysPerMonth: 22 }

function load(): WorkSettings {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    const parsed = s ? JSON.parse(s) : {}
    // migrate old "daysOff" key → workDaysPerMonth
    if (parsed.daysOff !== undefined && parsed.workDaysPerMonth === undefined) {
      parsed.workDaysPerMonth = Math.max(1, 30 - parsed.daysOff)
      delete parsed.daysOff
    }
    return { ...DEFAULTS, ...parsed }
  } catch { return DEFAULTS }
}

interface Props { onClose: () => void }

export default function WorkTimeCalculator({ onClose }: Props) {
  const [tab, setTab] = useState<'calc' | 'settings'>('calc')
  const [settings, setSettings] = useState<WorkSettings>(load)
  const [draft, setDraft] = useState<WorkSettings>(load)
  const [price, setPrice] = useState('')

  const workDays = Math.max(1, settings.workDaysPerMonth)
  const workHoursPerMonth = workDays * settings.hoursPerDay
  const hourlyRate = settings.salary > 0 && workHoursPerMonth > 0
    ? settings.salary / workHoursPerMonth
    : 0

  const priceNum = parseFloat(price) || 0
  const totalHours = hourlyRate > 0 && priceNum > 0 ? priceNum / hourlyRate : 0
  const totalSec = Math.floor(totalHours * 3600)
  const secPerDay   = settings.hoursPerDay * 3600
  const secPerMonth = workDays * settings.hoursPerDay * 3600
  const secPerYear  = 12 * secPerMonth
  const dYears   = Math.floor(totalSec / secPerYear)
  const dMonths  = Math.floor((totalSec % secPerYear) / secPerMonth)
  const dDays    = Math.floor((totalSec % secPerMonth) / secPerDay)
  const dHours   = Math.floor((totalSec % secPerDay) / 3600)
  const dMinutes = Math.floor((totalSec % 3600) / 60)
  const dSeconds = totalSec % 60

  const isReady = settings.salary > 0 && settings.hoursPerDay > 0

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    setSettings(draft)
    setTab('calc')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-sm bg-card rounded-t-3xl lg:rounded-3xl p-5 shadow-2xl animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
              <Icon path={mdiClockMinusOutline} size={0.8} color="#8b5cf6" />
            </div>
            <div>
              <h2 className="font-bold text-base-theme leading-tight">ของชิ้นนี้กี่ชั่วโมง?</h2>
              <p className="text-[10px] text-muted-theme">แปลงราคาเป็นเวลาทำงาน</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab(tab === 'settings' ? 'calc' : 'settings')}
              className={`p-2 rounded-xl transition-colors ${
                tab === 'settings'
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600'
                  : 'text-muted-theme hover:bg-input'
              }`}
              aria-label="Settings"
            >
              <Icon path={tab === 'settings' ? mdiPencilOutline : mdiCog} size={0.8} />
            </button>
            <button onClick={onClose} className="p-2 text-muted-theme hover:bg-input rounded-xl">
              <Icon path={mdiClose} size={0.8} />
            </button>
          </div>
        </div>

        {/* ── CALCULATE TAB ── */}
        {tab === 'calc' ? (
          <div className="space-y-4">
            {/* Not configured warning */}
            {!isReady && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <span>⚙️</span>
                <span>กรุณาตั้งค่าเงินเดือนก่อน</span>
                <button onClick={() => setTab('settings')} className="ml-auto font-bold underline shrink-0">
                  ตั้งค่า
                </button>
              </div>
            )}

            {/* Rate summary */}
            {isReady && (
              <div className="bg-input rounded-2xl px-4 py-3 grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-xs font-bold text-base-theme">฿{settings.salary.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-theme">เดือน</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-base-theme">{settings.hoursPerDay} ชม.</p>
                  <p className="text-[10px] text-muted-theme">ต่อวัน</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-500">฿{hourlyRate.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-theme">ต่อชั่วโมง</p>
                </div>
              </div>
            )}

            {/* Price input */}
            <div>
              <label className="text-xs text-muted-theme mb-1.5 block font-medium">ราคาของที่อยากซื้อ (บาท)</label>
              <input
                type="number"
                inputMode="decimal"
                placeholder="เช่น 35000"
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-input border border-theme
                           text-base-theme text-sm outline-none focus:border-brand-500 transition-colors"
                autoFocus
              />
            </div>

            {/* Result */}
            {priceNum > 0 && isReady && (
              <div className="bg-gradient-to-br from-brand-50 to-violet-50 dark:from-brand-950/60 dark:to-violet-950/40
                              border border-brand-200 dark:border-brand-800/50 rounded-2xl p-4">
                <p className="text-xs text-muted-theme mb-3 text-center font-medium">
                  ฿{priceNum.toLocaleString()} ต้องทำงาน...
                </p>
                {(dYears > 0 || dMonths > 0) && (
                  <div className="grid grid-cols-2 gap-2 text-center mb-2">
                    {[
                      { value: dYears,  label: 'ปี' },
                      { value: dMonths, label: 'เดือน' },
                    ].map(({ value, label }) => (
                      <div key={label} className="bg-white/70 dark:bg-white/10 rounded-xl py-2.5">
                        <p className="text-xl font-extrabold text-brand-600 leading-none tabular-nums">{value.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-theme mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-2 text-center mb-3">
                  {[
                    { value: dDays,    label: 'วัน' },
                    { value: dHours,   label: 'ชม.' },
                    { value: dMinutes, label: 'นาที' },
                    { value: dSeconds, label: 'วิ.' },
                  ].map(({ value, label }) => (
                    <div key={label}
                      className="bg-white/70 dark:bg-white/10 rounded-xl py-2.5">
                      <p className="text-xl font-extrabold text-brand-600 leading-none tabular-nums">{value.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-theme mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-center text-[10px] text-muted-theme">
                  รวม {totalHours.toFixed(2)} ชั่วโมง · คิดเป็น {(priceNum / settings.salary * 100).toFixed(1)}% ของเงินเดือน
                </p>
              </div>
            )}
          </div>

        ) : (
          /* ── SETTINGS TAB ── */
          <div className="space-y-3">
            <p className="text-xs text-muted-theme">ตั้งค่าข้อมูลการทำงาน — บันทึกไว้ในเครื่องของคุณ</p>

            {([
              { label: 'เงินเดือน (บาท/เดือน)',   key: 'salary'           as const, placeholder: '30000', min: 1 },
              { label: 'ชั่วโมงทำงาน / วัน',       key: 'hoursPerDay'      as const, placeholder: '8',     min: 1 },
              { label: 'วันทำงาน / เดือน',           key: 'workDaysPerMonth' as const, placeholder: '22',    min: 1 },
            ] as const).map(({ label, key, placeholder, min }) => (
              <div key={key}>
                <label className="text-xs text-muted-theme mb-1.5 block font-medium">{label}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder={placeholder}
                  min={min}
                  value={draft[key] === 0 ? '' : draft[key]}
                  onChange={e => setDraft(d => ({ ...d, [key]: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-4 py-3 rounded-2xl bg-input border border-theme
                             text-base-theme text-sm outline-none focus:border-brand-500 transition-colors"
                />
              </div>
            ))}

            {/* Preview */}
            {draft.salary > 0 && draft.hoursPerDay > 0 && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                อัตรา: ฿{(draft.salary / (Math.max(1, draft.workDaysPerMonth) * draft.hoursPerDay)).toFixed(2)} / ชม.
                · {Math.max(1, draft.workDaysPerMonth)} วันทำงาน/เดือน
              </div>
            )}

            <button
              onClick={saveSettings}
              className="w-full py-3 rounded-2xl bg-brand-600 text-white font-semibold text-sm
                         active:scale-95 transition-transform flex items-center justify-center gap-2 mt-1"
            >
              <Icon path={mdiContentSave} size={0.8} color="white" />
              บันทึกการตั้งค่า
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
