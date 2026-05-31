import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../api'
import { useAuthStore } from '../../store/auth.store'
import { useI18n } from '../../store/i18n.store'

const WALLETS = [
  { key: 'emergency',  name: 'เงินสำรองฉุกเฉิน', nameEn: 'Emergency Fund',     icon: '🏦', color: '#f59e0b', pct: 10, desc: 'เก็บไว้ 3–6 เดือน',   descEn: 'Save 3–6 months' },
  { key: 'fixed',      name: 'ค่าใช้จ่ายคงที่',   nameEn: 'Fixed Expenses',     icon: '🏠', color: '#3b82f6', pct: 30, desc: 'ค่าเช่า, ค่าน้ำไฟ', descEn: 'Rent, utilities' },
  { key: 'daily',      name: 'ค่าใช้จ่ายประจำวัน', nameEn: 'Daily Expenses',    icon: '🍚', color: '#10b981', pct: 20, desc: 'อาหาร, เดินทาง',   descEn: 'Food, transport' },
  { key: 'savings',    name: 'เป้าหมายการออม',     nameEn: 'Savings Goal',      icon: '🎯', color: '#6366f1', pct: 10, desc: 'ซื้อของ, ท่องเที่ยว', descEn: 'Shopping, travel' },
  { key: 'investment', name: 'การลงทุน',           nameEn: 'Investment',         icon: '📈', color: '#06b6d4', pct: 15, desc: 'หุ้น, กองทุน',    descEn: 'Stocks, funds' },
  { key: 'personal',   name: 'ส่วนตัว/บันเทิง',   nameEn: 'Personal / Fun',    icon: '🎉', color: '#ec4899', pct: 10, desc: 'fun money',        descEn: 'Fun money' },
  { key: 'health',     name: 'สุขภาพ/ประกัน',     nameEn: 'Health / Insurance', icon: '🏥', color: '#ef4444', pct: 5,  desc: 'ค่าหมอ, เบี้ยประกัน', descEn: 'Doctor, insurance' },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, setAuth, token } = useAuthStore()
  const { lang } = useI18n()
  const [selected, setSelected] = useState<Set<string>>(new Set(WALLETS.map(w => w.key)))
  const [loading, setLoading] = useState(false)

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleDone = async () => {
    setLoading(true)
    try {
      await authApi.completeOnboarding(Array.from(selected), lang)
      if (user && token) {
        setAuth(token, { ...user, onboardingCompleted: true })
      }
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-app flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">👋</div>
          <h1 className="text-2xl font-extrabold text-base-theme">ยินดีต้อนรับ!</h1>
          <p className="text-muted-theme mt-2 text-sm">เลือก wallet ที่อยากใช้จัดการเงินของคุณ<br />สามารถเพิ่มหรือลบได้ภายหลัง</p>
        </div>

        <div className="space-y-2 mb-6">
          {WALLETS.map(w => {
            const on = selected.has(w.key)
            return (
              <button
                key={w.key}
                onClick={() => toggle(w.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left
                  ${on ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-[var(--border)] bg-card'}`}
              >
                <span className="text-2xl">{w.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base-theme text-sm">{lang === 'en' ? w.nameEn : w.name}</div>
                  <div className="text-xs text-muted-theme">{lang === 'en' ? w.descEn : w.desc} · {lang === 'en' ? 'Recommended' : 'แนะนำ'} {w.pct}%</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
                  ${on ? 'border-brand-500 bg-brand-500' : 'border-[var(--border)]'}`}>
                  {on && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>}
                </div>
              </button>
            )
          })}
        </div>

        <button
          onClick={handleDone}
          disabled={loading || selected.size === 0}
          className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-bold text-sm
                     disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {loading ? 'กำลังตั้งค่า...' : `เริ่มใช้งาน (${selected.size} wallet)`}
        </button>

        <button
          onClick={() => {
            setSelected(new Set(['emergency', 'daily', 'savings']))
          }}
          className="w-full mt-2 py-2 text-sm text-muted-theme hover:text-base-theme transition-colors"
        >
          เลือกขั้นต่ำ (3 wallet)
        </button>
      </div>
    </div>
  )
}
