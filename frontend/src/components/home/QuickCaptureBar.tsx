import { useState, FormEvent } from 'react'
import Icon from '@mdi/react'
import { mdiSend, mdiMicrophone, mdiRobotOutline } from '@mdi/js'
import clsx from 'clsx'
import { useT } from '../../store/i18n.store'
import { usePanels } from '../../store/panels.store'
import { track } from '../../utils/telemetry'

/**
 * Natural-language capture, pinned to the home screen.
 *
 * The assistant already had a `create_transaction` tool — typing "coffee 45" has been
 * able to produce a transaction for a while. It was just unreachable: the only entry
 * point was a 3px strip at the edge of the screen that pulsed for six seconds and then
 * looked like a scrollbar. Free-text entry is the fastest path through the core loop,
 * so it belongs where the loop starts.
 *
 * Nothing is committed from here — the text is handed to the assistant, which confirms
 * before writing. See ChatPanel.
 */
export default function QuickCaptureBar() {
  const t = useT()
  const openChat = usePanels(s => s.openChat)
  const [value, setValue] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (!text) return
    track('quick_capture_used')
    openChat(text)
    setValue('')
  }

  // Web Speech API is Chromium/Safari-only; hide the affordance rather than offer a
  // button that silently does nothing.
  const speechSupported = typeof window !== 'undefined'
    && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const startDictation = () => {
    const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!Ctor) return
    const recognition = new Ctor()
    recognition.lang = (localStorage.getItem('flo_lang') ?? 'th') === 'th' ? 'th-TH' : 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event: any) => {
      const said = event.results?.[0]?.[0]?.transcript
      if (said) setValue(prev => (prev ? `${prev} ${said}` : said))
    }
    try { recognition.start() } catch { /* already listening */ }
  }

  return (
    <form onSubmit={submit} className="animate-fade-up">
      <div className="flex items-center gap-2 rounded-2xl bg-card border border-theme shadow-sm px-3 py-2">
        <Icon path={mdiRobotOutline} size={0.75} color="#10b981" className="shrink-0" />
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={t('qc_placeholder')}
          aria-label={t('qc_placeholder')}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-base-theme
                     placeholder:text-muted-theme"
        />
        {speechSupported && (
          <button
            type="button"
            onClick={startDictation}
            aria-label="Dictate"
            className="shrink-0 p-1.5 rounded-lg text-muted-theme active:bg-[var(--input)] transition-colors"
          >
            <Icon path={mdiMicrophone} size={0.75} />
          </button>
        )}
        <button
          type="submit"
          disabled={!value.trim()}
          aria-label={t('qc_send')}
          className={clsx(
            'shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all',
            value.trim()
              ? 'bg-emerald-500 text-white active:scale-95'
              : 'bg-[var(--input)] text-muted-theme cursor-not-allowed',
          )}
        >
          <Icon path={mdiSend} size={0.65} />
        </button>
      </div>
    </form>
  )
}
