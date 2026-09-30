import { create } from 'zustand'

type Choice = 'accepted' | 'dismissed'
type InstallPromptEvent = Event & {
  prompt: () => Promise<unknown>
  userChoice: Promise<{ outcome: Choice }>
}
export type InstallPlatform = 'android' | 'ios' | 'desktop'
interface InstallState {
  platform: InstallPlatform
  standalone: boolean
  browserAccepted: boolean
  canPrompt: boolean
  online: boolean
  secure: boolean
  status: 'idle' | 'prompting' | Choice | 'failed'
}

const isIos = /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standaloneQuery = window.matchMedia('(display-mode: standalone)')
const isStandalone = () => standaloneQuery.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export const useInstallStore = create<InstallState>(() => ({
  platform: isIos ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop',
  standalone: isStandalone(),
  browserAccepted: false,
  canPrompt: false,
  online: navigator.onLine,
  secure: window.isSecureContext,
  status: 'idle',
}))

let deferredPrompt: InstallPromptEvent | null = null
let cleanup: (() => void) | undefined

/** Start before React mounts so a prompt arriving before a lazy route is not lost. */
export function trackAppInstallation(): () => void {
  if (cleanup) return cleanup
  const onPrompt = (event: Event) => {
    event.preventDefault()
    deferredPrompt = event as InstallPromptEvent
    useInstallStore.setState({
      canPrompt: true, browserAccepted: false,
      status: useInstallStore.getState().status === 'prompting' ? 'prompting' : 'idle',
    })
  }
  const onInstalled = () => {
    deferredPrompt = null
    // Android can emit appinstalled before WebAPK creation finishes. Hide promotion,
    // but never claim that this proves successful OS installation or launch.
    useInstallStore.setState({ browserAccepted: true, canPrompt: false, status: 'accepted' })
  }
  const onConnection = () => useInstallStore.setState({ online: navigator.onLine })
  const onDisplayMode = () => useInstallStore.setState({ standalone: isStandalone() })
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)
  window.addEventListener('online', onConnection)
  window.addEventListener('offline', onConnection)
  standaloneQuery.addEventListener('change', onDisplayMode)
  cleanup = () => {
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
    window.removeEventListener('online', onConnection)
    window.removeEventListener('offline', onConnection)
    standaloneQuery.removeEventListener('change', onDisplayMode)
    deferredPrompt = null
    cleanup = undefined
  }
  return cleanup
}

/** Must be invoked directly by a click; each browser prompt can only be used once. */
export async function requestAppInstallation(): Promise<Choice | 'failed' | 'unavailable'> {
  const state = useInstallStore.getState()
  if (!deferredPrompt || state.status === 'prompting' || !state.online || !state.secure || state.standalone) return 'unavailable'
  const prompt = deferredPrompt
  deferredPrompt = null
  useInstallStore.setState({ canPrompt: false, status: 'prompting' })
  try {
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (!useInstallStore.getState().browserAccepted) useInstallStore.setState({ status: outcome })
    return outcome
  } catch {
    if (!useInstallStore.getState().browserAccepted) useInstallStore.setState({ status: 'failed' })
    return 'failed'
  }
}
