import { useState, FormEvent, useRef, useEffect } from 'react'
import Icon from '@mdi/react'
import {
  mdiAccount, mdiLogout, mdiPlus, mdiTrashCan,
  mdiPencil, mdiCheck, mdiClose, mdiWeatherNight,
  mdiWeatherSunny, mdiTranslate, mdiWallet, mdiCash,
  mdiLock, mdiEye, mdiEyeOff,
} from '@mdi/js'
import clsx from 'clsx'
import { authApi, categoriesApi } from '../../api'
import { useAuthStore } from '../../store/auth.store'
import { useThemeStore } from '../../store/theme.store'
import { useI18n, useT } from '../../store/i18n.store'
import { useCategories } from '../../hooks'
import { Card, Skeleton, ConfirmModal } from '../../components/ui'
import IconDisplay from '../../components/ui/IconDisplay'
import { MDI_ICON_CATEGORIES } from '../../utils/iconMap'
import type { Category, EntryType } from '../../types'
import DangerZone from '../../components/settings/DangerZone'

const PRESET_COLORS = [
  '#6366f1','#f97316','#3b82f6','#a855f7','#ef4444',
  '#ec4899','#eab308','#14b8a6','#22c55e','#10b981',
  '#06b6d4','#84cc16','#94a3b8','#64748b',
]
const PRESET_ICONS_EXPENSE = MDI_ICON_CATEGORIES.expense
const PRESET_ICONS_INCOME  = MDI_ICON_CATEGORIES.income

export default function Settings() {
  const t = useT()
  const { user, token, clearAuth, setAuth } = useAuthStore()
  const { theme, toggle: toggleTheme } = useThemeStore()
  const { lang, setLang } = useI18n()
  const formRef = useRef<HTMLDivElement>(null)

  // Refresh user data on mount to get up-to-date hasPassword
  useEffect(() => {
    if (!token) return
    authApi.me().then(fresh => setAuth(token, fresh)).catch(() => {})
  }, [])

  // ── Profile ────────────────────────────────────────────────
  const [name, setName]           = useState(user?.name ?? '')
  const [expectedIncome, setExpectedIncome] = useState(
    user?.expectedMonthlyIncome != null ? String(user.expectedMonthlyIncome) : '',
  )
  const [savingProfile, setSaveP] = useState(false)
  const [profileOk, setProfileOk] = useState(false)

  // ── Category ───────────────────────────────────────────────
  const { data: categories, loading: loadingCats, refetch } = useCategories()
  const [catType, setCatType] = useState<EntryType>('expense')
  const [editId, setEditId]   = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [catName, setCatName] = useState('')
  const [catIcon, setCatIcon] = useState('food')
  const [catColor, setCatColor] = useState('#6366f1')
  const [savingCat, setSavingCat] = useState(false)

  // ── Password ───────────────────────────────────────────────
  const [pwOpen, setPwOpen]           = useState(false)
  const [currentPw, setCurrentPw]     = useState('')
  const [newPw, setNewPw]             = useState('')
  const [confirmPw, setConfirmPw]     = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw]         = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [pwSaving, setPwSaving]       = useState(false)
  const [pwError, setPwError]         = useState('')
  const [pwOk, setPwOk]               = useState(false)

  const closePwModal = () => {
    setPwOpen(false); setCurrentPw(''); setNewPw(''); setConfirmPw('')
    setPwError(''); setPwOk(false); setShowCurrentPw(false); setShowNewPw(false); setShowConfirmPw(false)
  }

  const handleChangePassword = async () => {
    setPwError('')
    if (newPw !== confirmPw) { setPwError(t('password_mismatch')); return }
    if (newPw.length < 8) { setPwError(t('min_chars')); return }
    setPwSaving(true)
    try {
      const res = await authApi.changePassword({
        ...(user?.hasPassword ? { currentPassword: currentPw } : {}),
        newPassword: newPw,
      })
      // Backend rotates the token version on change (revoking other sessions),
      // so adopt the fresh token it returns to keep this session alive.
      if (res?.accessToken && res?.user) setAuth(res.accessToken, res.user)
      setPwOk(true)
      setTimeout(closePwModal, 1500)
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setPwError(typeof msg === 'string' ? msg : t('pw_wrong_current'))
    } finally { setPwSaving(false) }
  }

  // ── Confirm ────────────────────────────────────────────────
  const [confirmState, setConfirmState] = useState<{
    open: boolean; message: string; onConfirm: () => void
  }>({ open: false, message: '', onConfirm: () => {} })

  const askConfirm = (message: string, onConfirm: () => void) =>
    setConfirmState({ open: true, message, onConfirm })
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false }))

  const filteredCats = categories?.filter(c => c.type === catType) ?? []

  const profileDirty = name !== user?.name
    || expectedIncome !== String(user?.expectedMonthlyIncome ?? '')

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaveP(true)
    try {
      const updated = await authApi.updateProfile({
        name,
        ...(expectedIncome !== '' ? { expectedMonthlyIncome: Number(expectedIncome) } : {}),
      })
      setAuth(useAuthStore.getState().token!, {
        ...user!, name: updated.name, expectedMonthlyIncome: updated.expectedMonthlyIncome,
      })
      setProfileOk(true)
      setTimeout(() => setProfileOk(false), 2000)
    } finally { setSaveP(false) }
  }

  const startEdit = (cat: Category) => {
    setEditId(cat.id); setShowAdd(false)
    setCatName(cat.name); setCatIcon(cat.icon); setCatColor(cat.color)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  const startAdd = () => {
    setEditId(null)
    setCatName(''); setCatIcon(catType === 'expense' ? 'food' : 'salary'); setCatColor('#6366f1')
    setShowAdd(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  const cancelForm = () => { setEditId(null); setShowAdd(false) }

  const handleCatSave = async () => {
    if (!catName.trim()) return
    setSavingCat(true)
    try {
      if (editId) {
        await categoriesApi.update(editId, { name: catName, icon: catIcon, color: catColor })
      } else {
        await categoriesApi.create({ name: catName, icon: catIcon, color: catColor, type: catType })
      }
      cancelForm(); refetch()
    } finally { setSavingCat(false) }
  }

  const handleDeleteCat = async (id: string) => {
    askConfirm(t('delete_confirm'), async () => {
      closeConfirm()
      await categoriesApi.remove(id)
      refetch()
    })
  }

  const iconPresets = catType === 'expense' ? PRESET_ICONS_EXPENSE : PRESET_ICONS_INCOME

  return (
    <div className="px-4 pt-6 pb-6 space-y-5 animate-fade-in">
      <h1 className="text-2xl font-extrabold text-base-theme tracking-tight">{t('settings')}</h1>

      {/* ── Profile ── */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
            <Icon path={mdiAccount} size={0.9} color="#4f46e5" />
          </div>
          <div>
            <p className="font-bold text-base-theme text-sm">{user?.name}</p>
            <p className="text-xs text-muted-theme">{user?.email}</p>
          </div>
        </div>
        <form onSubmit={handleProfileSave} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-theme block mb-1.5 uppercase tracking-wide">
              {t('display_name')}
            </label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl border border-theme bg-input
                         text-sm font-medium text-base-theme outline-none
                         focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-theme block mb-1.5 uppercase tracking-wide">
              {t('expected_monthly_income')}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-theme">฿</span>
              <input
                type="number" inputMode="decimal" step="0.01" min={0} placeholder="0"
                value={expectedIncome} onChange={e => setExpectedIncome(e.target.value)}
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-theme bg-input
                           text-sm font-medium text-base-theme outline-none
                           focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
              />
            </div>
            <p className="text-[11px] text-muted-theme mt-1.5">{t('expected_income_desc')}</p>
          </div>
          <button type="submit" disabled={savingProfile || !profileDirty}
            className={clsx('w-full py-2.5 rounded-xl text-sm font-bold transition-all text-white',
              profileOk ? 'bg-emerald-500' : 'bg-brand-600 disabled:opacity-40')}>
            {profileOk ? t('saved_') : savingProfile ? t('saving_') : t('save_changes')}
          </button>
        </form>
      </Card>

      {/* ── Security ── */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon path={mdiLock} size={0.85} className="text-muted-theme" />
            <span className="text-sm font-medium text-base-theme">{t('security')}</span>
          </div>
          <button
            onClick={() => setPwOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-brand-50 dark:bg-brand-900/30
                       text-xs font-semibold text-brand-600 transition-colors">
            {user?.hasPassword ? t('change_password') : t('set_password')}
          </button>
        </div>
      </Card>

      {/* ── Appearance ── */}
      <Card>
        <p className="text-sm font-bold text-base-theme mb-4">{t('appearance')}</p>

        {/* Dark mode toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon path={theme === 'dark' ? mdiWeatherNight : mdiWeatherSunny}
                  size={0.85} className="text-muted-theme" />
            <span className="text-sm font-medium text-base-theme">{t('dark_mode')}</span>
          </div>
          <button
            onClick={toggleTheme}
            className={clsx(
              'relative w-12 h-6 rounded-full transition-colors duration-200',
              theme === 'dark' ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600',
            )}
          >
            <span className={clsx(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
              theme === 'dark' && 'translate-x-6',
            )} />
          </button>
        </div>

        {/* Language */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon path={mdiTranslate} size={0.85} className="text-muted-theme" />
            <span className="text-sm font-medium text-base-theme">{t('language')}</span>
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-xl p-1 gap-1">
            {(['th', 'en'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={clsx('px-3 py-1 rounded-lg text-xs font-bold transition-all uppercase',
                  lang === l ? 'bg-white dark:bg-slate-600 text-brand-600 shadow-sm' : 'text-muted-theme')}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Categories ── */}
      <Card padding={false}>
        <div ref={formRef} className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-theme">
          <h2 className="font-bold text-base-theme text-sm">{t('categories')}</h2>
          <button onClick={startAdd}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600
                       bg-brand-50 dark:bg-brand-900/30 px-3 py-1.5 rounded-full transition-colors">
            <Icon path={mdiPlus} size={0.6} /> {t('add')}
          </button>
        </div>

        {/* Type toggle */}
        <div className="flex gap-1 mx-5 mt-4 mb-3 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
          {(['expense', 'income'] as EntryType[]).map(tp => (
            <button key={tp} onClick={() => { setCatType(tp); cancelForm() }}
              className={clsx('flex-1 py-2 rounded-lg text-xs font-semibold transition-all capitalize flex items-center justify-center gap-1',
                catType === tp ? 'bg-white dark:bg-slate-600 text-base-theme shadow-sm' : 'text-muted-theme')}>
              <Icon path={tp === 'expense' ? mdiWallet : mdiCash} size={0.5} />
              {tp === 'expense' ? t('expenses_tab') : t('income_tab2')}
            </button>
          ))}
        </div>

        {/* Add/Edit form */}
        {(showAdd || editId) && (
          <div className="mx-5 mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl space-y-3 animate-fade-up">
            <p className="text-xs font-bold text-muted-theme uppercase tracking-wide">
              {editId ? t('edit_category') : t('new_category')}
            </p>
            <input type="text" value={catName} onChange={e => setCatName(e.target.value)}
              placeholder={t('cat_name_ph')} maxLength={50}
              className="w-full px-3 py-2 rounded-xl border border-theme bg-input
                         text-sm font-medium text-base-theme outline-none focus:border-brand-400 transition-all" />
            <div>
              <p className="text-[10px] font-semibold text-muted-theme mb-2 uppercase tracking-wide">{t('icon')}</p>
              <div className="flex flex-wrap gap-2">
                {iconPresets.map(ic => (
                  <button key={ic.id} type="button" onClick={() => setCatIcon(ic.id)}
                    className={clsx('w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                      catIcon === ic.id ? 'bg-brand-100 dark:bg-brand-900/40 ring-2 ring-brand-400' : 'bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600')}
                    title={ic.label}>
                    <Icon path={ic.mdi} size={0.6} color="#666" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-theme mb-2 uppercase tracking-wide">{t('color')}</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setCatColor(c)}
                    className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                    style={{ backgroundColor: c, outline: catColor === c ? `3px solid ${c}` : 'none', outlineOffset: '2px' }} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: catColor + '22' }}>
                <IconDisplay icon={catIcon} color={catColor} size="md" />
              </div>
              <span className="flex-1 text-sm font-semibold text-base-theme truncate">
                {catName || t('preview')}
              </span>
              <button onClick={cancelForm}
                className="p-2 rounded-xl bg-slate-200 dark:bg-slate-600 text-muted-theme transition-colors">
                <Icon path={mdiClose} size={0.7} />
              </button>
              <button onClick={handleCatSave} disabled={savingCat || !catName.trim()}
                className="p-2 rounded-xl bg-brand-600 text-white disabled:opacity-40 transition-colors">
                <Icon path={mdiCheck} size={0.7} />
              </button>
            </div>
          </div>
        )}

        {/* Category list */}
        <div className="pb-4">
          {loadingCats ? (
            <div className="space-y-2 px-5">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filteredCats.length === 0 ? (
            <p className="text-center text-sm text-muted-theme py-8">—</p>
          ) : (
            <ul className="divide-y divide-theme">
              {filteredCats.map(cat => (
                <li key={cat.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: (cat.color ?? '#e2e8f0') + '22' }}>
                    <IconDisplay icon={cat.icon} color={cat.color} size="md" />
                  </div>
                  <span className="flex-1 text-sm font-semibold text-base-theme truncate">{cat.name}</span>
                  {cat.isDefault && (
                    <span className="text-[10px] text-muted-theme font-medium">{t('default_label')}</span>
                  )}
                  <button onClick={() => startEdit(cat)}
                    className="p-1.5 rounded-lg text-muted-theme hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                    <Icon path={mdiPencil} size={0.6} />
                  </button>
                  <button onClick={() => handleDeleteCat(cat.id)}
                    className="p-1.5 rounded-lg text-muted-theme hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                    <Icon path={mdiTrashCan} size={0.6} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ── Sign out ── */}
      <button onClick={() => clearAuth()}
        className="w-full flex items-center justify-between px-5 py-4 bg-card
                   rounded-2xl border border-theme shadow-sm
                   text-rose-500 font-semibold text-sm active:bg-rose-50 dark:active:bg-rose-900/20 transition-colors">
        <span>{t('sign_out')}</span>
        <Icon path={mdiLogout} size={0.8} />
      </button>
      {/* ── Password Modal ── */}
      {pwOpen && (
        <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center p-4 bg-black/40"
             onClick={closePwModal}>
          <div className="w-full max-w-sm bg-card rounded-3xl p-6 space-y-4 animate-fade-up"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base-theme">
                {user?.hasPassword ? t('change_password') : t('set_password')}
              </h2>
              <button onClick={closePwModal} className="p-1 text-muted-theme">
                <Icon path={mdiClose} size={0.9} />
              </button>
            </div>

            {user?.hasPassword && (
              <div className="relative">
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  placeholder={t('current_password_label')}
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-theme bg-input
                             text-sm text-base-theme outline-none focus:border-brand-400 transition-all"
                />
                <button type="button" onClick={() => setShowCurrentPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-theme">
                  <Icon path={showCurrentPw ? mdiEyeOff : mdiEye} size={0.75} />
                </button>
              </div>
            )}

            <div className="relative">
              <input
                type={showNewPw ? 'text' : 'password'}
                placeholder={`${t('new_password')} ${t('min_chars')}`}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                className="w-full px-4 py-3 pr-11 rounded-xl border border-theme bg-input
                           text-sm text-base-theme outline-none focus:border-brand-400 transition-all"
              />
              <button type="button" onClick={() => setShowNewPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-theme">
                <Icon path={showNewPw ? mdiEyeOff : mdiEye} size={0.75} />
              </button>
            </div>

            <div className="relative">
              <input
                type={showConfirmPw ? 'text' : 'password'}
                placeholder={t('confirm_password')}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                className="w-full px-4 py-3 pr-11 rounded-xl border border-theme bg-input
                           text-sm text-base-theme outline-none focus:border-brand-400 transition-all"
              />
              <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-theme">
                <Icon path={showConfirmPw ? mdiEyeOff : mdiEye} size={0.75} />
              </button>
            </div>

            {pwError && (
              <p className="text-xs text-rose-500 font-medium">{pwError}</p>
            )}

            <button
              onClick={handleChangePassword}
              disabled={pwSaving || !newPw || !confirmPw || (!!user?.hasPassword && !currentPw)}
              className={clsx(
                'w-full py-3 rounded-2xl text-sm font-bold text-white transition-colors',
                pwOk ? 'bg-emerald-500' : 'bg-brand-600 disabled:opacity-40',
              )}
            >
              {pwOk ? `✓ ${t('pw_changed')}` : pwSaving ? t('saving_') : t('save_changes')}
            </button>
          </div>
        </div>
      )}

      {/* Last on the page on purpose: nothing should be scrolled past on the way to it. */}
      <DangerZone />

      <ConfirmModal
        open={confirmState.open}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  )
}
