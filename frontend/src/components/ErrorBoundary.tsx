import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { useT } from '../store/i18n.store'
import { isChunkLoadError, reloadApp } from '../utils/appRecovery'

interface Props { children: ReactNode }
interface State { error: Error | null; recovering: boolean }

function ErrorScreen({ error, recovering, retry }: {
  error: Error; recovering: boolean; retry: () => void
}) {
  const t = useT()
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  const chunkError = isChunkLoadError(error)

  return (
    <main className="min-h-dvh bg-app text-base-theme flex items-center justify-center p-6">
      <section className="surface w-full max-w-md p-6 sm:p-8 text-center" aria-labelledby="app-error-title">
        <img src="/icon.svg" alt="MoneyFlow" width="56" height="56" className="mx-auto mb-5" />
        <h1 id="app-error-title" className="text-xl font-bold mb-3">
          {t(chunkError ? 'app_error_page_title' : 'app_error_title')}
        </h1>
        <p role="status" className="text-sm text-muted-theme leading-relaxed mb-6">
          {t(!online ? 'app_error_offline' : recovering ? 'app_error_updating' : chunkError ? 'app_error_page_hint' : 'app_error_hint')}
        </p>
        <button className="primary-action w-full" onClick={retry} disabled={recovering || !online}>
          {t(recovering ? 'app_error_updating' : 'app_error_reload')}
        </button>
        <details className="mt-5 text-left text-xs text-muted-theme">
          <summary className="cursor-pointer py-2">{t('app_error_details')}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono leading-relaxed">{error.message}</pre>
        </details>
      </section>
    </main>
  )
}

/** Render-time failures stay actionable; stale lazy routes get one bounded retry. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, recovering: false }

  static getDerivedStateFromError(error: Error): Pick<State, 'error'> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MoneyFlow] unhandled render error:', error, info.componentStack)
    if (isChunkLoadError(error)) void this.retry(true)
  }

  retry = async (automatic = false) => {
    this.setState({ recovering: true })
    const reloading = await reloadApp(automatic)
    if (!reloading) this.setState({ recovering: false })
  }

  render() {
    if (!this.state.error) return this.props.children
    return <ErrorScreen error={this.state.error} recovering={this.state.recovering} retry={() => { void this.retry() }} />
  }
}
