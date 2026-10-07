import { useEffect, useState } from 'react'
import Icon from '@mdi/react'
import clsx from 'clsx'
import { MDI_ICON_CATEGORIES, getPresetIconPath } from '../../utils/iconMap'
import { loadMdiPath, mdiExportName } from '../../utils/customIcons'
import { useT } from '../../store/i18n.store'
import type { EntryType } from '../../types'

type Check = { status: 'idle' | 'loading' | 'invalid' | 'failed' | 'ready'; path?: string }

export default function CategoryIconPicker({ value, type, color, onChange, onValidityChange }: {
  value: string; type: EntryType; color: string
  onChange: (icon: string) => void; onValidityChange: (valid: boolean) => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(getPresetIconPath(value) ? '' : value ?? '')
  const [check, setCheck] = useState<Check>({ status: draft ? 'loading' : 'idle' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!draft.trim()) { onValidityChange(true); setCheck({ status: 'idle' }); return }
    onValidityChange(false)
    if (!mdiExportName(draft)) { setCheck({ status: 'invalid' }); return }
    let active = true
    setCheck({ status: 'loading' })
    const timer = setTimeout(() => {
      loadMdiPath(draft).then(path => {
        if (!active) return
        setCheck(path ? { status: 'ready', path } : { status: 'invalid' })
        onValidityChange(!!path)
        if (path) onChange(mdiExportName(draft)!)
      }).catch(() => { if (active) setCheck({ status: 'failed' }) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [draft, retry, onChange, onValidityChange])

  return <div className="space-y-3">
    <p className="text-xs font-semibold text-muted-theme">{t('icon')}</p>
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('cat_icon_presets')}>
      {MDI_ICON_CATEGORIES[type].map(icon => <button key={icon.id} type="button"
        aria-label={icon.label} aria-pressed={!draft && value === icon.id} title={icon.label}
        onClick={() => { setDraft(''); setCheck({ status: 'idle' }); onChange(icon.id); onValidityChange(true) }}
        className={clsx('w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
          !draft && value === icon.id ? 'bg-brand-100 dark:bg-brand-900/40 ring-2 ring-brand-400' : 'bg-card hover:bg-input')}>
        <Icon path={icon.mdi} size={0.6} color={color} />
      </button>)}
    </div>
    <div className="space-y-1.5">
      <label htmlFor="category-icon-code" className="block text-xs font-semibold text-base-theme">{t('cat_icon_code')}</label>
      <input id="category-icon-code" value={draft} type="text" maxLength={50}
        autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="mdi:train"
        aria-invalid={check.status === 'invalid'} aria-describedby="category-icon-hint"
        className="w-full px-3 py-2.5 rounded-xl border border-theme bg-input text-sm text-base-theme"
        onChange={e => {
          setDraft(e.target.value); onValidityChange(!e.target.value.trim())
          setCheck({ status: e.target.value.trim() ? 'loading' : 'idle' })
          if (!e.target.value.trim()) onChange(type === 'income' ? 'otherincome' : 'other')
        }} />
      <p id="category-icon-hint" className="text-xs text-muted-theme leading-relaxed">{t('cat_icon_hint')}</p>
      <a href="https://pictogrammers.com/library/mdi/" target="_blank" rel="noopener noreferrer"
        className="inline-block text-xs font-semibold text-brand-600 dark:text-brand-300 py-1 underline underline-offset-2">{t('cat_icon_catalog')}</a>
      {check.status === 'loading' && <p role="status" className="text-xs text-muted-theme">{t('cat_icon_loading')}</p>}
      {check.status === 'invalid' && <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{t('cat_icon_invalid')}</p>}
      {check.status === 'failed' && <div className="space-y-1">
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{t('cat_icon_failed')}</p>
        <button type="button" className="secondary-action !text-xs" onClick={() => setRetry(n => n + 1)}>{t('cat_icon_retry')}</button>
      </div>}
      {check.status === 'ready' && <div role="status" className="flex gap-2 items-center rounded-xl bg-input p-3 text-xs text-base-theme">
        <span role="img" aria-label={t('cat_icon_preview')} className="shrink-0"><Icon path={check.path!} size={0.9} color={color} /></span>
        <span className="break-all">{t('cat_icon_ready')}: {mdiExportName(draft)}</span>
      </div>}
    </div>
  </div>
}
