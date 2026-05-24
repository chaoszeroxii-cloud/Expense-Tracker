import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiChartBar, mdiCashMultiple, mdiTrendingUp, mdiReceiptTextOutline,
  mdiWallet, mdiChevronRight,
} from '@mdi/js'

const FEATURES = [
  {
    to: '/budget',
    icon: mdiChartBar,
    color: '#6366f1',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    title: 'วางแผนงบประมาณ',
    desc: 'ตั้งงบรายเดือนแต่ละหมวด ดู actual vs budget',
  },
  {
    to: '/loans',
    icon: mdiCashMultiple,
    color: '#f59e0b',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    title: 'ติดตามเงินให้ยืม',
    desc: 'บันทึกว่าใครยืมเท่าไหร่ ยังค้างอยู่เท่าไหร่',
  },
  {
    to: '/investments',
    icon: mdiTrendingUp,
    color: '#06b6d4',
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    title: 'การลงทุน',
    desc: 'ติดตามพอร์ตกองทุน หุ้น ต้นทุนและกำไร',
  },
  {
    to: '/tax',
    icon: mdiReceiptTextOutline,
    color: '#10b981',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    title: 'วางแผนภาษี',
    desc: 'คำนวณภาษี ค่าลดหย่อน AI แนะนำการประหยัดภาษี',
  },
  {
    to: '/wallets',
    icon: mdiWallet,
    color: '#8b5cf6',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    title: 'กระเป๋าเงิน',
    desc: 'จัดการ wallet และ envelope budgeting',
  },
]

export default function Finance() {
  const navigate = useNavigate()

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-base-theme">การเงิน</h1>
        <p className="text-sm text-muted-theme mt-0.5">เครื่องมือวางแผนการเงินครบวงจร</p>
      </div>

      <div className="space-y-3">
        {FEATURES.map(f => (
          <button
            key={f.to}
            onClick={() => navigate(f.to)}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-[var(--border)]
                       active:scale-[0.98] transition-all text-left hover:border-[var(--text-muted)]"
          >
            <div className={`w-12 h-12 rounded-2xl ${f.bg} flex items-center justify-center shrink-0`}>
              <Icon path={f.icon} size={1.1} color={f.color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base-theme text-sm">{f.title}</div>
              <div className="text-xs text-muted-theme mt-0.5 leading-relaxed">{f.desc}</div>
            </div>
            <Icon path={mdiChevronRight} size={0.8} className="text-muted-theme shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
