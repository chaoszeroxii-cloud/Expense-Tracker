import { useState, FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '@mdi/react'
import { mdiEye, mdiEyeOff, mdiAlertCircle, mdiCheckCircle } from '@mdi/js'
import { authApi } from '../../api'
import { useT, useI18n } from '../../store/i18n.store'
import { useThemeStore } from '../../store/theme.store'

export default function ResetPasswordPage() {
  const t = useT()
  const { lang, setLang } = useI18n()
  const { theme, toggle } = useThemeStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError(t('password_mismatch')); return }
    setLoading(true)
    setError(null)
    try {
      await authApi.resetPassword(token, password)
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(Array.isArray(msg) ? msg[0] : (msg ?? t('invalid_reset_link')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-brand-600 via-brand-700 to-slate-900
                    flex flex-col items-center justify-center px-5 py-12">
      <div className="absolute top-5 right-5 flex gap-2">
        <button onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
          className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold uppercase">
          {lang === 'th' ? 'EN' : 'TH'}
        </button>
        <button onClick={toggle}
          className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center">
          <Icon path={theme === 'dark' ? mdiEye : mdiEyeOff} size={0.7} />
        </button>
      </div>

      <div className="flex flex-col items-center gap-3 mb-10 animate-fade-up">
        <div className="w-16 h-16 rounded-3xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-xl">
          <img src="/icon.svg" alt="" className="w-10 h-auto" style={{ filter: 'brightness(0) invert(1)' }} />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">MoneyFlow</h1>
      </div>

      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl shadow-2xl shadow-black/30 overflow-hidden animate-fade-up delay-75">
        <div className="px-6 py-7">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6">{t('reset_password')}</h2>

          {success ? (
            <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800
                            text-emerald-700 dark:text-emerald-300 rounded-xl px-4 py-4 text-sm animate-fade-in">
              <Icon path={mdiCheckCircle} size={0.8} className="flex-shrink-0 mt-0.5" />
              <span>{t('password_reset_success')}</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-wide">
                  {t('new_password')} <span className="text-slate-300 normal-case font-normal">{t('min_chars')}</span>
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    required minLength={8} placeholder="••••••••" autoComplete="new-password"
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 dark:border-slate-600
                               bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100
                               font-medium text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all placeholder:text-slate-300" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600">
                    <Icon path={showPw ? mdiEyeOff : mdiEye} size={0.7} />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-wide">
                  {t('confirm_password')}
                </label>
                <input
                  type={showPw ? 'text' : 'password'} value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required minLength={8} placeholder="••••••••" autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600
                             bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100
                             font-medium text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all placeholder:text-slate-300" />
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
                {loading ? t('please_wait') : t('reset_password')}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-brand-600 dark:text-brand-400 font-medium hover:underline">
              ← {t('back_to_login')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
