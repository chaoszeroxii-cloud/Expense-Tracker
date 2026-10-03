import { useEffect, useRef, useState } from 'react'
import Icon from '@mdi/react'
import { mdiEmailSyncOutline } from '@mdi/js'
import { useLocation, useNavigate } from 'react-router-dom'
import { bankMailApi } from '../../api'
import { useT, useI18n, type TKey } from '../../store/i18n.store'
import type { Category } from '../../types'
import type { BankMailEntry, BankMailSettings as Settings, BankMailStatus, BankMailSyncSummary } from '../../types/bankMail'
import { fmt } from '../../utils/money'

const field = 'w-full rounded-xl border border-theme bg-input px-3 py-2.5 text-sm text-base-theme'
const reasons: Record<string, TKey> = {
  possible_transfer: 'mail_possible_transfer', possible_duplicate: 'mail_possible_duplicate',
  fee_review: 'mail_fee_review', category_required: 'mail_category_required', review_required: 'mail_review_required',
  account_required: 'mail_account_required',
}
const defaults = (): Settings => ({ autoImport: false, expenseCategoryId: null, incomeCategoryId: null, ownAccounts: [] })
const banks = ['ktb', 'scb', 'promptpay', 'other'] as const
function syncErrorKey(code?: string): TKey {
  if (code === 'reconnect_required') return 'mail_reconnect_required'
  if (code === 'rate_limited') return 'mail_rate_limited'
  if (code === 'page_expired') return 'mail_page_expired'
  if (code === 'mail_not_configured') return 'mail_unconfigured'
  if (code === 'mail_duplicate') return 'mail_duplicate'
  return 'mail_sync_error'
}
function skipReasonKey(code: string): TKey {
  if (code === 'unverified_sender' || code === 'unsupported_sender') return 'mail_skip_sender'
  if (code === 'mail_too_large') return 'mail_skip_large'
  if (code === 'message_gone') return 'mail_skip_gone'
  if (['ambiguous_template', 'invalid_amount', 'invalid_date', 'invalid_transaction'].includes(code)) return 'mail_skip_fields'
  return 'mail_skip_template'
}

export default function BankMailSettings({ categories }: { categories: Category[] }) {
  const t = useT(), { lang } = useI18n()
  const location = useLocation(), navigate = useNavigate()
  const [status, setStatus] = useState<BankMailStatus | null>(null)
  const [settings, setSettings] = useState<Settings>(defaults)
  const [list, setList] = useState<{ rows: BankMailEntry[]; total: number }>({ rows: [], total: 0 })
  const [filter, setFilter] = useState<BankMailEntry['status']>('pending')
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true)
  const [error, setError] = useState<TKey | null>(null), [notice, setNotice] = useState<TKey | null>(null)
  const [syncSummary, setSyncSummary] = useState<BankMailSyncSummary | null>(null)
  const [bank, setBank] = useState<string>('ktb'), [tail, setTail] = useState('')
  const alive = useRef(true), initialized = useRef(false), completing = useRef<Promise<void> | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const params = new URLSearchParams(location.search), result = params.get('gmail')
    if (!result) return
    if (result === 'complete' && !completing.current) {
      const fragment = new URLSearchParams(location.hash.slice(1))
      setBusy(true)
      completing.current = bankMailApi.complete(fragment.get('state') ?? '', fragment.get('code') ?? '')
        .then(value => { if (alive.current) setNotice(value.connected ? 'mail_connected' : 'mail_connect_failed') })
        .catch(() => { if (alive.current) setError('mail_connect_failed') })
        .finally(() => { if (alive.current) setBusy(false) })
    } else if (result !== 'complete') setNotice('mail_connect_failed')
    params.delete('gmail')
    navigate({ pathname: location.pathname, search: params.toString(), hash: '' }, { replace: true })
  }, [location, navigate])
  useEffect(() => {
    let active = true
    setLoading(true); setError(null)
    Promise.resolve(completing.current).then(() => Promise.all([bankMailApi.status(), bankMailApi.entries(filter, offset)])).then(([s, entries]) => {
      if (!active) return
      setStatus(s); setList(entries)
      if (!initialized.current) { setSettings(s.settings); initialized.current = true }
    }).catch(() => { if (active) setError('mail_sync_error') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filter, offset])
  const refresh = async () => {
    const [s, entries] = await Promise.all([bankMailApi.status(), bankMailApi.entries(filter, offset)])
    if (alive.current) {
      setStatus(s); setList(entries)
      if (!initialized.current) { setSettings(s.settings); initialized.current = true }
    }
  }
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(null); setNotice(null); setSyncSummary(null)
    try { await action() }
    catch (err) {
      const response = (err as { response?: { status?: number; data?: { message?: string } } }).response
      if (alive.current) setError(syncErrorKey(response?.status === 429 ? 'rate_limited' : response?.data?.message))
    } finally { if (alive.current) setBusy(false) }
  }
  const connect = () => run(async () => { const result = await bankMailApi.connect(); if (alive.current) window.location.assign(result.url) })
  const checkMail = () => run(async () => {
    let result
    try { result = await bankMailApi.sync() }
    catch (err) {
      // A revoked grant is persisted by the API. Refresh even after failure so the
      // reconnect action appears immediately; preserve the original sync error.
      await refresh().catch(() => {})
      throw err
    }
    await refresh()
    if (!alive.current) return
    setSyncSummary(result.summary ?? null)
    setNotice(result.busy ? 'mail_busy' : result.continued ? 'mail_more' : result.summary ? null : 'mail_checked')
    window.dispatchEvent(new CustomEvent('moneyflow:refresh', { detail: { types: ['dashboard', 'transactions', 'budget'] } }))
  })
  const bankName = (value: string) => value === 'other' ? t('mail_other') : value === 'promptpay' ? 'PromptPay' : value.toUpperCase()
  const addAccount = () => {
    if (!/^\d{4}$/.test(tail)) { setError('mail_account_invalid'); return }
    setSettings(s => ({ ...s, ownAccounts: [...new Set([...s.ownAccounts, `${bank}:${tail}`])].slice(0, 20) }))
    setTail(''); setError(null)
  }
  const autoReady = !!settings.expenseCategoryId && !!settings.incomeCategoryId && settings.ownAccounts.length > 0
  return <section id="settings-bank-mail" aria-labelledby="bank-mail-title" className="rounded-2xl border border-theme bg-card p-5 space-y-4 scroll-mt-5">
    <div className="flex gap-3 items-start">
      <Icon path={mdiEmailSyncOutline} size={1} className="text-brand-500 shrink-0 mt-1" />
      <div className="min-w-0"><h2 id="bank-mail-title" className="font-bold text-base-theme">{t('mail_title')}</h2>
        <p className="text-sm text-muted-theme mt-1">{t('mail_intro')}</p></div>
    </div>
    <p className="text-xs text-muted-theme leading-relaxed">{t('mail_privacy')}</p>
    <details className="text-xs text-muted-theme leading-relaxed"><summary className="cursor-pointer font-semibold">{t('mail_supported')}</summary>
      <p className="mt-2">{t('mail_coverage')}</p></details>
    {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{t(error)}</p>}
    {notice && <p role="status" className="text-sm text-base-theme">{t(notice)}</p>}
    {syncSummary && <div role="status" aria-label={t('mail_check_result')} className="rounded-xl bg-input p-3 space-y-2 text-xs text-muted-theme">
      <p className="font-semibold text-base-theme">{t('mail_check_result')}</p>
      <dl className="grid grid-cols-2 gap-2">
        {([['mail_matched', syncSummary.matched], ['mail_parsed', syncSummary.parsed], ['mail_existing', syncSummary.existing], ['mail_skipped_count', syncSummary.skipped]] as const).map(([key, value]) =>
          <div key={key}><dt>{t(key)}</dt><dd className="font-semibold text-base-theme">{value}</dd></div>)}
      </dl>
      {syncSummary.matched === 0 && <p>{t('mail_no_matches')}</p>}
      {(syncSummary.parsed > 0 || syncSummary.existing > 0) && <p>{t('mail_result_hint')}</p>}
      {Object.entries(syncSummary.skipReasons).map(([reason, count]) => <p key={reason}>{t(skipReasonKey(reason))}: {count}</p>)}
    </div>}
    {!status ? <button className="secondary-action" disabled={loading || busy} onClick={() => run(refresh)}>{t(loading ? 'mail_working' : 'mail_refresh')}</button>
      : !status.configured ? <p className="text-sm text-muted-theme">{t('mail_unconfigured')}</p>
      : <>
        {status.connected ? <div className="space-y-3">
          <p className="font-semibold text-sm text-base-theme break-all">{status.gmailAddress}</p>
          <p className="text-xs text-muted-theme">{t('mail_last_sync')}: {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB') : t('mail_never')}</p>
          {status.lastError && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{t(syncErrorKey(status.lastError))}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="primary-action" disabled={busy} onClick={checkMail}>{t(busy ? 'mail_working' : 'mail_check')}</button>
            {status.lastError === 'reconnect_required' && <button className="secondary-action" disabled={busy} onClick={connect}>{t('mail_reconnect')}</button>}
            <button className="secondary-action" disabled={busy} onClick={() => run(async () => {
              const result = await bankMailApi.disconnect(); setSettings(defaults()); await refresh()
              if (!result.revoked) setNotice('mail_revocation')
            })}>{t('mail_disconnect')}</button>
          </div>
          <fieldset disabled={busy} className="space-y-4 border-t border-theme pt-4">
            <legend className="sr-only">{t('mail_setup')}</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              {(['expense', 'income'] as const).map(type => <label key={type} className="text-xs font-semibold text-muted-theme space-y-1.5 block">
                <span>{t(type === 'expense' ? 'mail_expense_cat' : 'mail_income_cat')}</span>
                <select className={field} value={settings[`${type}CategoryId`] ?? ''} onChange={e => setSettings(s => ({ ...s, [`${type}CategoryId`]: e.target.value || null }))}>
                  <option value="">{t('mail_choose')}</option>{categories.filter(c => c.type === type).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>)}
            </div>
            <div className="space-y-2"><p className="text-sm font-semibold text-base-theme">{t('mail_accounts')}</p><p className="text-xs text-muted-theme leading-relaxed">{t('mail_accounts_hint')}</p>
              <div className="flex flex-wrap gap-2">{settings.ownAccounts.map(value => {
                const [b, suffix] = value.split(':')
                return <button type="button" key={value} className="secondary-action !text-xs" aria-label={`${t('mail_remove_account')} ${bankName(b)} ${suffix}`} onClick={() => setSettings(s => ({ ...s, ownAccounts: s.ownAccounts.filter(v => v !== value) }))}>{bankName(b)} • {suffix} ×</button>
              })}</div>
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <label className="text-xs text-muted-theme">{t('mail_bank')}<select className={field + ' mt-1'} value={bank} onChange={e => setBank(e.target.value)}>{banks.map(b => <option key={b} value={b}>{bankName(b)}</option>)}</select></label>
                <label className="text-xs text-muted-theme">{t('mail_tail')}<input className={field + ' mt-1'} inputMode="numeric" maxLength={4} placeholder="1234" value={tail} onChange={e => setTail(e.target.value.replace(/\D/g, ''))} /></label>
                <button type="button" className="secondary-action col-span-2 sm:col-span-1" disabled={settings.ownAccounts.length >= 20} onClick={addAccount}>{t('mail_add_account')}</button>
              </div>
            </div>
            <label className="flex items-start gap-3 text-sm text-base-theme"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" checked={settings.autoImport} onChange={e => setSettings(s => ({ ...s, autoImport: e.target.checked }))} /><span>{t('mail_auto')}</span></label>
            <p className="text-xs text-muted-theme leading-relaxed">{t('mail_auto_hint')}</p>
            {settings.autoImport && !autoReady && <p className="text-sm text-amber-700 dark:text-amber-300">{t('mail_account_needed')}</p>}
            <button className="secondary-action" disabled={settings.autoImport && !autoReady} onClick={() => run(async () => {
              await bankMailApi.settings(settings); await refresh(); setNotice('mail_saved_settings')
            })}>{t('mail_save_settings')}</button>
          </fieldset>
        </div> : <button className="primary-action" disabled={busy} onClick={connect}>{t('mail_connect')}</button>}
      </>}
    {status && (status.configured || status.pending > 0 || list.total > 0) && <div className="space-y-3 border-t border-theme pt-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('mail_pending')}>
        {(['pending', 'saved', 'ignored'] as const).map(value => <button key={value} className={filter === value ? 'primary-action !text-xs' : 'secondary-action !text-xs'} disabled={busy || loading} aria-pressed={filter === value} onClick={() => { setFilter(value); setOffset(0) }}>{t(`mail_${value}`)}{value === 'pending' ? ` (${status.pending})` : ''}</button>)}
        <button className="secondary-action !text-xs" disabled={busy || loading} onClick={() => run(refresh)}>{t('mail_refresh')}</button>
      </div>
      {!syncSummary && status.skipped > 0 && <p className="text-xs text-muted-theme">{t('mail_skipped_hint')} {status.skipped}</p>}
      {loading ? <p className="text-sm text-muted-theme">{t('mail_working')}</p> : list.rows.length === 0 ? <p className="text-sm text-muted-theme py-3">{t('mail_empty')}</p> : list.rows.map(entry => <Entry key={entry.id} entry={entry} categories={categories} settings={settings} busy={busy} onSave={(category, type, allowDuplicate) => run(async () => {
        await bankMailApi.save(entry.id, category, type, allowDuplicate); await refresh(); setNotice('mail_recorded')
        window.dispatchEvent(new CustomEvent('moneyflow:refresh', { detail: { types: ['dashboard', 'transactions', 'budget'] } }))
      })} onSkip={() => run(async () => { await bankMailApi.ignore(entry.id); await refresh() })} />)}
      {(offset > 0 || offset + 20 < list.total) && <div className="flex justify-between gap-3">
        <button className="secondary-action" disabled={busy || loading || offset === 0} onClick={() => setOffset(n => Math.max(0, n - 20))}>{t('mail_previous')}</button>
        <button className="secondary-action" disabled={busy || loading || offset + 20 >= list.total} onClick={() => setOffset(n => n + 20)}>{t('mail_next')}</button>
      </div>}
    </div>}
  </section>
}

function Entry({ entry, categories, settings, busy, onSave, onSkip }: {
  entry: BankMailEntry; categories: Category[]; settings: Settings; busy: boolean
  onSave: (category: string, type: 'expense' | 'income', allowDuplicate: boolean) => void; onSkip: () => void
}) {
  const t = useT(), { lang } = useI18n(), data = entry.transaction
  const [type, setType] = useState(data.type)
  const [category, setCategory] = useState(settings[`${data.type}CategoryId`] ?? '')
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const valid = categories.some(c => c.id === category && c.type === type)
  return <article className="rounded-xl border border-theme p-3 space-y-3">
    <div className="flex flex-wrap justify-between gap-2 text-sm text-base-theme">
      <div><p className="font-semibold">{data.bank.toUpperCase()} • {data.accountSuffix}</p><p className="text-xs text-muted-theme">{new Date(data.occurredAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB')}</p></div>
      <p className="font-bold">{data.type === 'expense' ? '−' : '+'}฿{fmt(data.amount + data.fee)}</p>
    </div>
    {data.kind === 'bill_payment' && <p className="text-xs text-muted-theme">{t('mail_bill_payment')}</p>}
    {data.memo && <p className="text-sm text-base-theme whitespace-pre-wrap break-words">{t('mail_memo')}: {data.memo}</p>}
    {data.counterpartySuffix && <p className="text-xs text-muted-theme">{t('mail_counterparty')}: {data.counterpartyBank.toUpperCase()} • {data.counterpartySuffix}</p>}
    {data.fee > 0 && <p className="text-xs text-muted-theme">{t('mail_fee')}: ฿{fmt(data.fee)}</p>}
    {entry.status === 'saved' && !entry.expenseId && <p className="text-xs text-muted-theme">{t('mail_deleted_entry')}</p>}
    {entry.status === 'pending' && <>
      <p className="text-xs text-amber-700 dark:text-amber-300">{t(reasons[entry.reason ?? ''] ?? 'mail_review_required')}</p>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label={t('dc_type')} className={field} disabled={busy} value={type} onChange={e => { const next = e.target.value as 'expense' | 'income'; setType(next); setCategory(settings[`${next}CategoryId`] ?? ''); setAllowDuplicate(false) }}>
          <option value="expense">{t('expense')}</option><option value="income">{t('income')}</option>
        </select>
        <select aria-label={t('mail_choose')} className={field} disabled={busy} value={valid ? category : ''} onChange={e => setCategory(e.target.value)}><option value="">{t('mail_choose')}</option>{categories.filter(c => c.type === type).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      <label className="flex gap-2 text-xs text-muted-theme"><input type="checkbox" disabled={busy} checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)} />{t('mail_duplicate_confirm')}</label>
      <div className="flex flex-wrap gap-2"><button className="primary-action !text-xs" disabled={busy || !valid} onClick={() => onSave(category, type, allowDuplicate)}>{t('mail_record')}</button><button className="secondary-action !text-xs" disabled={busy} onClick={onSkip}>{t('mail_skip')}</button></div>
    </>}
  </article>
}
