// Apply saved appearance before the first paint, without waiting for React's bundle.
try {
  document.documentElement.classList.toggle('dark', localStorage.getItem('flo_theme') === 'dark')
} catch { /* Storage may be unavailable; the default light theme still works. */ }
