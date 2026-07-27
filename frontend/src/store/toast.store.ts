import { create } from 'zustand'

export type ToastTone = 'error' | 'success' | 'info'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
  /** Optional single action, e.g. "Try again" or "Undo". */
  action?: { label: string; onPress: () => void }
  /** ms before auto-dismiss; `null` keeps it until dismissed. */
  duration: number | null
}

interface ToastState {
  toasts: Toast[]
  show: (t: Omit<Toast, 'id' | 'duration' | 'tone'> & { tone?: ToastTone; duration?: number | null }) => number
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  show: ({ message, tone = 'info', action, duration }) => {
    const id = nextId++
    // Errors stay until dismissed or superseded — a save failure that vanishes after
    // three seconds is barely better than no message at all.
    const resolved = duration !== undefined ? duration : tone === 'error' ? null : 3000
    set((s) => ({ toasts: [...s.toasts, { id, message, tone, action, duration: resolved }] }))
    return id
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Imperative helpers for use outside React components. */
export const toast = {
  error:   (message: string, action?: Toast['action']) =>
    useToastStore.getState().show({ message, tone: 'error', action }),
  success: (message: string, action?: Toast['action']) =>
    useToastStore.getState().show({ message, tone: 'success', action }),
  info:    (message: string, action?: Toast['action']) =>
    useToastStore.getState().show({ message, tone: 'info', action }),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
}
