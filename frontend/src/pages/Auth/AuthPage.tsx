import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import { mdiWallet, mdiEye, mdiEyeOff, mdiAlertCircle } from '@mdi/js'
import clsx from 'clsx'
import { authApi } from '../../api'
import { useAuthStore } from '../../store/auth.store'
import { useT, useI18n } from '../../store/i18n.store'
import { useThemeStore } from '../../store/theme.store'

type Tab = 'login' | 'register'

export default function AuthPage() {
  const navigate  = useNavigate()
  const setAuth   = useAuthStore(s => s.setAuth)
  const t         = useT()
  const { lang, setLang } = useI18n()
  const { theme, toggle } = useThemeStore()

  const [tab, setTab]           = useState<Tab>('login')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string|null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      const data = tab==='login'
        ? await authApi.login({ email, password })
        : await authApi.register({ email, name, password })
      setAuth(data.accessToken, data.user)
      navigate('/', { replace: true })
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Something went wrong'))
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-brand-600 via-brand-700 to-slate-900
                    flex flex-col items-center justify-center px-5 py-12">
      {/* Lang + Theme toggles */}
      <div className="absolute top-5 right-5 flex gap-2">
        <button onClick={() => setLang(lang==='th'?'en':'th')}
          className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold uppercase">
          {lang==='th'?'EN':'TH'}
        </button>
        <button onClick={toggle}
          className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center">
          <Icon path={theme==='dark'?mdiEye:mdiEyeOff} size={0.7} />
        </button>
      </div>

      {/* Brand */}
      <div className="flex flex-col items-center gap-3 mb-10 animate-fade-up">
        <div className="w-16 h-16 rounded-3xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-xl">
          <Icon path={mdiWallet} size={1.4} color="white" />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">MoneyFlow</h1>
        <p className="text-brand-200 text-sm font-medium">{t('tagline')}</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl shadow-2xl shadow-black/30 overflow-hidden animate-fade-up delay-75">
        <div className="flex border-b border-slate-100 dark:border-slate-700">
          {(['login','register'] as Tab[]).map(tp => (
            <button key={tp} onClick={() => { setTab(tp); setError(null) }}
              className={clsx('flex-1 py-4 text-sm font-bold transition-colors',
                tab===tp ? 'text-brand-600 border-b-2 border-brand-600'
                         : 'text-slate-400 dark:text-slate-500 hover:text-slate-600')}>
              {tp==='login' ? t('sign_in') : t('create_account')}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-7 space-y-4">
          {tab==='register' && (
            <div className="animate-fade-up">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-wide">
                {t('full_name')}
              </label>
              <input type="text" value={name} onChange={e=>setName(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600
                           bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100
                           font-medium text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all" />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-wide">
              {t('email')}
            </label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600
                         bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100
                         font-medium text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all placeholder:text-slate-300" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-wide">
              {t('password')} {tab==='register' && <span className="text-slate-300 normal-case font-normal">{t('min_chars')}</span>}
            </label>
            <div className="relative">
              <input type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)}
                required minLength={tab==='register'?8:1} placeholder="••••••••"
                autoComplete={tab==='login'?'current-password':'new-password'}
                className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 dark:border-slate-600
                           bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100
                           font-medium text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all placeholder:text-slate-300" />
              <button type="button" onClick={() => setShowPw(v=>!v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600">
                <Icon path={showPw?mdiEyeOff:mdiEye} size={0.7} />
              </button>
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800
                            text-rose-600 rounded-xl px-4 py-3 text-sm animate-fade-in">
              <Icon path={mdiAlertCircle} size={0.7} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl bg-brand-600 text-white font-bold text-sm
                       shadow-lg shadow-brand-500/30 active:scale-[0.98] transition-all disabled:opacity-60 mt-2">
            {loading ? t('please_wait') : tab==='login' ? t('sign_in') : t('create_account')}
          </button>
        </form>
      </div>
      <p className="text-brand-300 text-xs mt-8 text-center">{t('privacy_note')}</p>
    </div>
  )
}
