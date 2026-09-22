import { useState, useRef, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import { mdiSend, mdiMicrophone, mdiPlus, mdiArrowBottomLeft, mdiChevronDown } from '@mdi/js'
import { useT, useI18n } from '../../store/i18n.store'
import { usePanels } from '../../store/panels.store'
import { toast } from '../../store/toast.store'
import { track } from '../../utils/telemetry'
import { fmtRound } from '../../utils/money'
import IconDisplay from '../ui/IconDisplay'
import type { DailyBriefTransaction } from '../../types'

export default function QuickCaptureBar({ recent = [] }: { recent?: DailyBriefTransaction[] }) {
  const t = useT()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const openChat = usePanels((s) => s.openChat)
  const [value, setValue] = useState('')
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<{ abort: () => void } | null>(null)
  useEffect(
    () => () => {
      recognitionRef.current?.abort()
    },
    [],
  )
  const seen = new Set<string>()
  const repeats = recent
    .filter((tx) => {
      const key = `${tx.categoryId}:${tx.amount}:${tx.note ?? ''}`
      if (tx.type !== 'expense' || !tx.categoryId || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 3)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    track('quick_capture_used')
    openChat(value.trim())
    setValue('')
  }
  const speechSupported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  const startDictation = () => {
    const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!Ctor || listening) return
    const recognition = new Ctor()
    recognitionRef.current = recognition
    recognition.lang = lang === 'th' ? 'th-TH' : 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event: any) => {
      const said = event.results?.[0]?.[0]?.transcript
      if (said) setValue((prev) => (prev ? `${prev} ${said}` : said))
    }
    recognition.onerror = (event: { error: string }) => {
      if (event.error !== 'aborted') toast.error(t('ux_mic_failed'))
    }
    recognition.onend = () => setListening(false)
    try {
      recognition.start()
      setListening(true)
    } catch {
      setListening(false)
      toast.error(t('ux_mic_failed'))
    }
  }

  return (
    <section className="surface p-5 sm:p-6 h-full flex flex-col" aria-label={t('ux_capture_title')}>
      <h2 className="text-lg font-bold text-base-theme">{t('ux_capture_title')}</h2>
      <p className="text-sm text-muted-theme mt-1 leading-relaxed">{t('ux_capture_sub')}</p>
      <div className="flex gap-2 mt-5">
        <button onClick={() => navigate('/add')} className="primary-action flex-1">
          <Icon path={mdiPlus} size={0.85} />
          {t('home_add_expense')}
        </button>
        <button
          onClick={() => navigate('/add', { state: { draft: { type: 'income' } } })}
          className="secondary-action"
        >
          <Icon path={mdiArrowBottomLeft} size={0.75} />
          {t('income_tab')}
        </button>
      </div>
      {repeats.length > 0 && (
        <div className="mt-5">
          <div className="flex flex-wrap justify-between gap-1">
            <h3 className="text-xs font-bold text-base-theme">{t('ux_repeat_title')}</h3>
            <span className="text-[11px] text-muted-theme">{t('ux_repeat_hint')}</span>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {repeats.map((tx) => (
              <button
                key={tx.id}
                onClick={() =>
                  navigate('/add', {
                    state: {
                      draft: {
                        type: tx.type,
                        amount: tx.amount,
                        categoryId: tx.categoryId,
                        note: tx.note ?? '',
                      },
                    },
                  })
                }
                aria-label={`${t('ux_repeat')}: ${tx.note || tx.categoryName} ฿${fmtRound(tx.amount)}`}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--input)] text-xs text-base-theme hover:bg-[var(--accent-soft)] transition-colors min-w-0 max-w-full"
              >
                <IconDisplay
                  icon={tx.categoryIcon ?? 'other'}
                  color={tx.categoryColor ?? undefined}
                  size="sm"
                />
                <span className="truncate max-w-28">{tx.note || tx.categoryName}</span>
                <span className="font-bold whitespace-nowrap">฿{fmtRound(tx.amount)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <details className="group mt-auto pt-5">
        <summary className="flex items-center justify-between gap-2 cursor-pointer list-none text-xs font-semibold text-muted-theme min-h-11 border-t border-theme pt-3">
          {t('ux_ai_title')}
          <Icon
            path={mdiChevronDown}
            size={0.65}
            className="shrink-0 group-open:rotate-180 transition-transform"
          />
        </summary>
        <form onSubmit={submit} className="mt-3">
          <label htmlFor="quick-capture" className="sr-only">
            {t('qc_placeholder')}
          </label>
          <div className="flex items-center gap-1 rounded-2xl bg-[var(--input)] p-2 border border-theme">
            <input
              id="quick-capture"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('qc_placeholder')}
              className="flex-1 min-w-0 bg-transparent text-sm p-2 text-base-theme"
            />
            {speechSupported && (
              <button
                type="button"
                onClick={startDictation}
                disabled={listening}
                aria-label={t('ux_dictate')}
                className="p-3 text-muted-theme rounded-xl"
              >
                <Icon path={mdiMicrophone} size={0.8} />
              </button>
            )}
            <button
              type="submit"
              disabled={!value.trim()}
              aria-label={t('qc_send')}
              className="p-3 rounded-xl bg-brand-600 text-white disabled:opacity-40"
            >
              <Icon path={mdiSend} size={0.8} />
            </button>
          </div>
          <p className="text-xs text-muted-theme mt-2" role="status">
            {listening ? t('ux_mic_listening') : t('ux_ai_hint')}
          </p>
        </form>
      </details>
    </section>
  )
}
