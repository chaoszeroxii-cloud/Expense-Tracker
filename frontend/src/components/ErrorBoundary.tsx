import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Last line of defence for a render-time throw.
 *
 * Without one, any exception during render unmounts the entire tree and leaves a blank
 * white page with nothing on screen to act on. That was not hypothetical here: a missing
 * `VITE_GOOGLE_CLIENT_ID` made Google's sign-in script throw while initialising, and
 * because the provider sits at the root of the app, the whole thing went blank — no
 * error, no login form, no way to tell a misconfigured build from a dead server.
 *
 * A boundary cannot make a broken dependency work, but it turns "nothing at all" into a
 * message and a reload button, which is the difference between a bug someone can report
 * and one they can only describe as "it doesn't open".
 */
interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept as a console error rather than shipped anywhere: the app has no error
    // reporting service, and inventing one here would send user data off-device.
    console.error('[MoneyFlow] unhandled render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', background: '#f8fafc', color: '#1e293b',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>😵</div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>
            เปิดแอปไม่สำเร็จ
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#64748b', margin: '0 0 20px' }}>
            มีบางอย่างผิดพลาดตอนโหลดหน้านี้ ลองโหลดใหม่อีกครั้ง
            ถ้ายังไม่ได้ ให้ตรวจว่าตั้งค่า environment ของแอปครบแล้ว
          </p>
          <pre style={{
            fontSize: 11, textAlign: 'left', background: '#f1f5f9', padding: 12,
            borderRadius: 10, overflowX: 'auto', color: '#475569', margin: '0 0 20px',
          }}>{this.state.error.message}</pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#4f46e5', color: '#fff', border: 0, padding: '12px 28px',
              borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            โหลดใหม่
          </button>
        </div>
      </div>
    )
  }
}
