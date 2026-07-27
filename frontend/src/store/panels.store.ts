import { create } from 'zustand'

/**
 * Open/closed state for the app-shell overlays (AI assistant, work-time calculator).
 *
 * These used to be `useState` inside `Layout`, which meant only Layout could open them —
 * hence the 3px "peek strip" pinned to the screen edge as the sole entry point. Hoisting
 * the state lets any screen offer a proper, discoverable way in.
 */
interface PanelState {
  chatOpen: boolean
  calcOpen: boolean
  /** Seeds the AI chat composer — used by the quick-capture bar. */
  chatDraft: string

  openChat: (draft?: string) => void
  closeChat: () => void
  openCalc: () => void
  closeCalc: () => void
}

export const usePanels = create<PanelState>((set) => ({
  chatOpen: false,
  calcOpen: false,
  chatDraft: '',

  openChat: (draft = '') => set({ chatOpen: true, chatDraft: draft }),
  closeChat: () => set({ chatOpen: false, chatDraft: '' }),
  openCalc: () => set({ calcOpen: true }),
  closeCalc: () => set({ calcOpen: false }),
}))
