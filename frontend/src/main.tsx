import React from 'react'
import ReactDOM from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

/**
 * The Google provider is mounted only when there is a client id to give it.
 *
 * `GoogleOAuthProvider` loads Google's GSI script and initialises it on mount. With an
 * empty `clientId` that initialisation throws, and because the provider wrapped the whole
 * app, the throw took the entire tree down to a blank white page — not a disabled sign-in
 * button, the whole app. Anyone following the README's quick start without setting up a
 * Google OAuth client hit exactly that, with nothing on screen to explain it.
 *
 * Skipping the provider leaves `useGoogleLogin` unusable, which is why AuthPage hides the
 * Google button when the id is absent rather than rendering one that cannot work.
 */
function Providers({ children }: { children: React.ReactNode }) {
  if (!GOOGLE_CLIENT_ID) {
    console.warn('[MoneyFlow] VITE_GOOGLE_CLIENT_ID is not set — Google sign-in is disabled')
    return <>{children}</>
  }
  return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{children}</GoogleOAuthProvider>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Providers>
        <App />
      </Providers>
    </ErrorBoundary>
  </React.StrictMode>,
)
