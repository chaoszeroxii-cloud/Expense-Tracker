import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import Icon from '@mdi/react'
import { mdiWallet, mdiEye, mdiEyeOff, mdiAlertCircle } from '@mdi/js'
import clsx from 'clsx'
import { authApi } from '../../api'
import { useAuthStore } from '../../store/auth.store'
import { useT, useI18n } from '../../store/i18n.store'
import { useThemeStore } from '../../store/theme.store'

type Tab = 'login' | 'register'

interface PendingSocial {
  provider: 'google' | 'facebook'
  token: string
  name: string
}

declare global {
  interface Window {
    FB: any
    fbAsyncInit: () => void
  }
}

const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID ?? ''

function loadFacebookSDK() {
  if (document.getElementById('facebook-jssdk')) return
  const script = document.createElement('script')
  script.id = 'facebook-jssdk'
  script.src = 'https://connect.facebook.net/en_US/sdk.js'
  script.async = true
  script.defer = true
  document.body.appendChild(script)
  window.fbAsyncInit = () => {
    window.FB.init({ appId: FB_APP_ID, cookie: true, xfbml: false, version: 'v19.0' })
  }
}

export default function AuthPage() {
  const navigate   = useNavigate()
  const setAuth    = useAuthStore(s => s.setAuth)
  const t          = useT()
  const { lang, setLang } = useI18n()
  const { theme, toggle } = useThemeStore()

  const [tab, setTab]           = useState<Tab>('login')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Social login state
  const [socialLoading, setSocialLoading]     = useState<'google' | 'facebook' | null>(null)
  const [showEmailModal, setShowEmailModal]   = useState(false)
  const [modalEmail, setModalEmail]           = useState('')
  const [pendingSocial, setPendingSocial]     = useState<PendingSocial | null>(null)

  useEffect(() => { loadFacebookSDK() }, [])

  const onAuthSuccess = (data: { accessToken: string; user: any }) => {
    setAuth(data.accessToken, data.user)
    navigate('/', { replace: true })
  }

  // ── Email / password submit ──────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      const data = tab === 'login'
        ? await authApi.login({ email, password })
        : await authApi.register({ email, name, password })
      onAuthSuccess(data)
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Something went wrong'))
    } finally { setLoading(false) }
  }

  // ── Google login ─────────────────────────────────────────────
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setSocialLoading('google')
      try {
        const data = await authApi.googleVerify(tokenResponse.access_token)
        if (data.requiresEmail) {
          setPendingSocial({ provider: 'google', token: tokenResponse.access_token, name: data.name })
          setShowEmailModal(true)
        } else {
          onAuthSuccess(data)
        }
      } catch {
        setError(t('social_login_failed'))
      } finally { setSocialLoading(null) }
    },
    onError: () => { setError(t('social_login_failed')); setSocialLoading(null) },
  })

  // ── Facebook login ───────────────────────────────────────────
  const isHttps = window.location.protocol === 'https:'

  const processFacebookToken = async (accessToken: string) => {
    try {
      const data = await authApi.facebookVerify(accessToken)
      if (data.requiresEmail) {
        setPendingSocial({ provider: 'facebook', token: accessToken, name: data.name })
        setShowEmailModal(true)
      } else {
        onAuthSuccess(data)
      }
    } catch {
      setError(t('social_login_failed'))
    } finally { setSocialLoading(null) }
  }

  const handleFacebookLogin = () => {
    if (!isHttps) { setError('Facebook Login requires HTTPS. Use Google instead for local testing.'); return }
    if (!window.FB) { setError(t('social_login_failed')); return }
    setSocialLoading('facebook')
    window.FB.login((response: any) => {
      if (!response.authResponse) { setSocialLoading(null); return }
      processFacebookToken(response.authResponse.accessToken)
    }, { scope: 'email' })
  }

  // ── Email modal submit ───────────────────────────────────────
  const handleModalSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!pendingSocial) return
    setSocialLoading(pendingSocial.provider)
    try {
      const data = pendingSocial.provider === 'google'
        ? await authApi.googleVerify(pendingSocial.token, modalEmail)
        : await authApi.facebookVerify(pendingSocial.token, modalEmail)
      setShowEmailModal(false)
      onAuthSuccess(data)
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(Array.isArray(msg) ? msg[0] : (msg ?? t('social_login_failed')))
    } finally { setSocialLoading(null) }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-brand-600 via-brand-700 to-slate-900
                    flex flex-col items-center justify-center px-5 py-12">
      {/* Lang + Theme toggles */}
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

      {/* Brand */}
      <div className="flex flex-col items-center gap-3 mb-10 animate-fade-up">
        <div className="w-16 h-16 rounded-3xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-xl">
          <img src="/icon.svg" alt="" className="w-10 h-auto" style={{ filter: 'brightness(0) invert(1)' }} />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">MoneyFlow</h1>
        <p className="text-brand-200 text-sm font-medium">{t('tagline')}</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl shadow-2xl shadow-black/30 overflow-hidden animate-fade-up delay-75">
        <div className="flex border-b border-slate-100 dark:border-slate-700">
          {(['login', 'register'] as Tab[]).map(tp => (
            <button key={tp} onClick={() => { setTab(tp); setError(null) }}
              className={clsx('flex-1 py-4 text-sm font-bold transition-colors',
                tab === tp ? 'text-brand-600 border-b-2 border-brand-600'
                           : 'text-slate-400 dark:text-slate-500 hover:text-slate-600')}>
              {tp === 'login' ? t('sign_in') : t('create_account')}
            </button>
          ))}
        </div>

        <div className="px-6 py-7 space-y-4">
          {/* Social buttons */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => { setError(null); googleLogin() }}
              disabled={!!socialLoading}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-slate-200
                         dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200
                         text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-600
                         transition-all disabled:opacity-60 active:scale-[0.98]">
              {socialLoading === 'google'
                ? <span className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                : <GoogleIcon />}
              {t('continue_google')}
            </button>

            <button
              type="button"
              onClick={() => { setError(null); handleFacebookLogin() }}
              disabled={!!socialLoading}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-xl
                         bg-[#1877F2] text-white text-sm font-semibold
                         hover:bg-[#166FE5] transition-all disabled:opacity-60 active:scale-[0.98]">
              {socialLoading === 'facebook'
                ? <span className="w-5 h-5 border-2 border-blue-300 border-t-white rounded-full animate-spin" />
                : <FacebookIcon />}
              {t('continue_facebook')}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600" />
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{t('social_or')}</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600" />
          </div>

          {/* Email / password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div className="animate-fade-up">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-wide">
                  {t('full_name')}
                </label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600
                             bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100
                             font-medium text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all" />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-wide">
                {t('email')}
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600
                           bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100
                           font-medium text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all" />
            </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {t('password')} {tab === 'register' && <span className="text-slate-300 normal-case font-normal">{t('min_chars')}</span>}
              </label>
              {tab === 'login' && (
                <Link to="/forgot-password" className="text-xs text-brand-500 hover:underline">
                  {t('forgot_password_link')}
                </Link>
              )}
            </div>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                required minLength={tab === 'register' ? 8 : 1} placeholder="••••••••"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 dark:border-slate-600
                           bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100
                           font-medium text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all placeholder:text-slate-300" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600">
                <Icon path={showPw ? mdiEyeOff : mdiEye} size={0.7} />
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
          <button type="submit" disabled={loading || !!socialLoading}
            className="w-full py-3.5 rounded-xl bg-brand-600 text-white font-bold text-sm
                       shadow-lg shadow-brand-500/30 active:scale-[0.98] transition-all disabled:opacity-60 mt-2">
            {loading ? t('please_wait') : tab === 'login' ? t('sign_in') : t('create_account')}
          </button>
          </form>
        </div>
      </div>
      <p className="text-brand-300 text-xs mt-8 text-center">{t('privacy_note')}</p>

      {/* Email modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-5">
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-7 animate-fade-up">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
              {t('enter_email_title')}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
              {t('enter_email_desc')}
            </p>
            <form onSubmit={handleModalSubmit} className="space-y-4">
              <input
                type="email"
                value={modalEmail}
                onChange={e => setModalEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600
                           bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100
                           font-medium text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all placeholder:text-slate-300"
              />
              {error && (
                <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-900/30 border border-rose-100
                                text-rose-600 rounded-xl px-4 py-3 text-sm">
                  <Icon path={mdiAlertCircle} size={0.7} className="flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="flex gap-3">
                <button type="button"
                  onClick={() => { setShowEmailModal(false); setPendingSocial(null) }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-600
                             text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={!!socialLoading}
                  className="flex-1 py-3 rounded-xl bg-brand-600 text-white text-sm font-bold
                             shadow-lg shadow-brand-500/30 disabled:opacity-60 transition-all">
                  {socialLoading ? t('please_wait') : t('sign_in')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  )
}
