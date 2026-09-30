const RETRY_KEY = 'flo_chunk_retry'
let pendingRecovery: Promise<boolean> | null = null

export function isChunkLoadError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|Unable to preload CSS for/i.test(error.message)
}

/** Wait for an updated shell before reloading; a plain reload can hit the old SW again. */
async function refreshWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return

  await new Promise<void>((resolve) => {
    let worker: ServiceWorker | null = null
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      worker?.removeEventListener('statechange', checkState)
      resolve()
    }
    const checkState = () => {
      if (worker?.state === 'activated' || worker?.state === 'redundant') finish()
    }
    // A slow/offline update must not strand the recovery screen indefinitely.
    const timeout = setTimeout(finish, 6000)
    void navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL).then(async (registration) => {
      if (!registration || finished) return finish()
      await registration.update()
      if (finished) return
      worker = registration.installing ?? registration.waiting
      if (!worker) return finish()
      worker.addEventListener('statechange', checkState)
      checkState()
    }).catch(finish)
  })
}

/** Only the error screen invokes this: worker activation never interrupts a healthy form. */
export function reloadApp(automatic = false): Promise<boolean> {
  if (pendingRecovery) return pendingRecovery
  if (!navigator.onLine) return Promise.resolve(false)

  try {
    // One automatic attempt per release per tab, including across reloads. A blocked
    // sessionStorage disables automatic recovery, since we cannot prevent a loop.
    if (automatic && sessionStorage.getItem(RETRY_KEY) === __APP_VERSION__) return Promise.resolve(false)
    sessionStorage.setItem(RETRY_KEY, __APP_VERSION__)
  } catch {
    if (automatic) return Promise.resolve(false)
  }

  pendingRecovery = (async () => {
    await refreshWorker()
    if (!navigator.onLine) return false
    // Keep the route, reset-password query, account and offline drafts intact.
    // In particular, do not clear storage, caches or service-worker registrations.
    window.location.reload()
    return true
  })().finally(() => { pendingRecovery = null })
  return pendingRecovery
}
