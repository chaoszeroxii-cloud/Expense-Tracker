import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../api'
import type { AdminUser, AdminStats, AiUsageStats } from '../../types'
import Icon from '@mdi/react'
import { mdiArrowLeft, mdiTrashCanOutline, mdiShieldAccountOutline, mdiAccountOutline, mdiChevronDown, mdiChevronUp, mdiMagnify, mdiRobotOutline } from '@mdi/js'

function fmt(n: number) { return n.toLocaleString('th-TH') }
function fmtThb(n: number) { return n === 0 ? '฿0.00' : n < 0.01 ? '<฿0.01' : `฿${n.toFixed(2)}` }
function fmtTokens(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) }

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [aiUsage, setAiUsage] = useState<AiUsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [s, u, ai] = await Promise.all([adminApi.getStats(), adminApi.getUsers(), adminApi.getAiUsage()])
    setStats(s)
    setUsers(u)
    setAiUsage(ai)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSetRole = async (id: string, role: 'user' | 'admin') => {
    setSaving(id)
    await adminApi.setRole(id, role)
    await load()
    setSaving(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ต้องการลบ user นี้? ข้อมูลทั้งหมดจะหายไป')) return
    await adminApi.deleteUser(id)
    await load()
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-dvh bg-app">
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-card border border-[var(--border)] text-muted-theme">
          <Icon path={mdiArrowLeft} size={0.85} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-base-theme">Admin Dashboard</h1>
          <p className="text-xs text-muted-theme">จัดการ users ทั้งหมด</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Users ทั้งหมด', value: fmt(stats.totalUsers), color: 'text-brand-600' },
            { label: 'Admins', value: fmt(stats.adminUsers), color: 'text-violet-600' },
            { label: 'ใหม่เดือนนี้', value: fmt(stats.newThisMonth), color: 'text-emerald-600' },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-2xl border border-[var(--border)] p-3 text-center">
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-theme mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* AI Usage */}
      <div className="bg-card rounded-2xl border border-[var(--border)] p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icon path={mdiRobotOutline} size={0.85} className="text-brand-600" />
          <h2 className="font-bold text-base-theme text-sm">AI Usage</h2>
          <span className="ml-auto text-xs text-muted-theme">
            รวม {fmtThb(aiUsage?.totalCostThb ?? 0)}
          </span>
        </div>
        {loading ? (
          <div className="h-12 bg-[var(--input)] rounded-xl animate-pulse" />
        ) : !aiUsage || aiUsage.users.length === 0 ? (
          <p className="text-xs text-muted-theme text-center py-3">ยังไม่มีการใช้งาน AI</p>
        ) : (
          <div className="space-y-2">
            {aiUsage.users.map(u => (
              <div key={u.userId} className="flex items-center gap-3 py-2 border-t border-[var(--border)] first:border-0 first:pt-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-base-theme truncate">{u.name}</p>
                  <p className="text-[10px] text-muted-theme truncate">{u.email}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-xs font-bold text-brand-600">{fmtThb(u.totalCostThb)}</p>
                  <p className="text-[10px] text-muted-theme">{fmtTokens(u.totalTokens)} tokens · {u.callCount} ครั้ง</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Icon path={mdiMagnify} size={0.85} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-theme" />
        <input
          placeholder="ค้นหา user..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-card border border-[var(--border)] text-base-theme text-sm outline-none"
        />
      </div>

      {/* User list */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-card rounded-2xl animate-pulse border border-[var(--border)]" />)}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(user => (
            <div key={user.id} className="bg-card rounded-2xl border border-[var(--border)] overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === user.id ? null : user.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0
                  ${user.role === 'admin' ? 'bg-violet-100 dark:bg-violet-900/30' : 'bg-brand-50 dark:bg-brand-900/20'}`}>
                  <Icon path={user.role === 'admin' ? mdiShieldAccountOutline : mdiAccountOutline}
                    size={0.85} color={user.role === 'admin' ? '#8b5cf6' : '#4f46e5'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base-theme text-sm truncate">{user.name}</span>
                    {user.role === 'admin' && (
                      <span className="text-[10px] bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded-full font-semibold shrink-0">Admin</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-theme truncate">{user.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-theme">{user.transactionCount} tx</p>
                  <Icon path={expanded === user.id ? mdiChevronUp : mdiChevronDown} size={0.7} className="text-muted-theme ml-auto" />
                </div>
              </button>

              {expanded === user.id && (
                <div className="border-t border-[var(--border)] p-4 space-y-3 animate-fade-in">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-theme">Balance: </span><span className="font-semibold text-base-theme">฿{fmt(user.totalBalance)}</span></div>
                    <div><span className="text-muted-theme">Currency: </span><span className="font-semibold text-base-theme">{user.currency}</span></div>
                    <div><span className="text-muted-theme">สมัคร: </span><span className="font-semibold text-base-theme">{new Date(user.createdAt).toLocaleDateString('th-TH')}</span></div>
                    <div><span className="text-muted-theme">Onboarding: </span><span className={`font-semibold ${user.onboardingCompleted ? 'text-emerald-500' : 'text-amber-500'}`}>{user.onboardingCompleted ? 'เสร็จแล้ว' : 'ยังไม่ทำ'}</span></div>
                  </div>
                  <div className="flex gap-2">
                    {user.role !== 'admin' ? (
                      <button onClick={() => handleSetRole(user.id, 'admin')} disabled={saving === user.id}
                        className="flex-1 py-2 rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 text-xs font-semibold disabled:opacity-50">
                        {saving === user.id ? '...' : 'ตั้งเป็น Admin'}
                      </button>
                    ) : (
                      <button onClick={() => handleSetRole(user.id, 'user')} disabled={saving === user.id}
                        className="flex-1 py-2 rounded-xl bg-[var(--input)] text-muted-theme text-xs font-semibold disabled:opacity-50">
                        {saving === user.id ? '...' : 'ลด Role เป็น User'}
                      </button>
                    )}
                    <button onClick={() => handleDelete(user.id)}
                      className="py-2 px-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 text-xs font-semibold">
                      <Icon path={mdiTrashCanOutline} size={0.75} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-theme">
          <p>ไม่พบ user ที่ตรงกับการค้นหา</p>
        </div>
      )}
    </div>
    </div>
  )
}
