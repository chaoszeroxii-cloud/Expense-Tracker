import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { captureApi } from '../../api'
import { useCategories, useFetch } from '../../hooks'
import { useT } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { fmt } from '../../utils/money'
import { ErrorState } from '../ui'
import type { PinnedEntry } from '../../types/companion'

const empty: Omit<PinnedEntry, 'id'> = {
  name: '',
  amount: 0,
  categoryId: '',
  type: 'expense',
  note: '',
}
export default function PinnedEntries() {
  const t = useT(),
    navigate = useNavigate()
  const { data, error, refetch } = useFetch(captureApi.templates)
  const { data: categories, error: categoryError } = useCategories()
  const [manage, setManage] = useState(false),
    [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ ...empty }),
    [editing, setEditing] = useState<string>()
  const report = (e: unknown) =>
    toast.error(apiErrorMessage(e, t('err_save_failed'), t('err_offline')))
  return (
    <div className="mt-5 border-t border-theme pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="section-title !text-sm">{t('dc_pins')}</h3>
        <button
          className="text-action !text-xs"
          onClick={() => setManage(!manage)}
          aria-expanded={manage}
        >
          {t('dc_manage')}
        </button>
      </div>
      {error ? (
        <ErrorState compact message={error} onRetry={refetch} retryLabel={t('action_retry')} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {data?.map((pin) => (
            <button
              key={pin.id}
              className="secondary-action !px-3 !py-2 !text-xs"
              onClick={() =>
                manage
                  ? (setForm({
                      name: pin.name,
                      amount: pin.amount,
                      categoryId: pin.categoryId,
                      type: pin.type,
                      note: pin.note,
                    }),
                    setEditing(pin.id))
                  : navigate('/add', { state: { draft: pin } })
              }
            >
              {pin.name} · ฿{fmt(pin.amount)}
            </button>
          ))}
        </div>
      )}
      {!data?.length && (
        <p className="text-xs text-muted-theme leading-relaxed">{t('dc_pin_hint')}</p>
      )}
      {manage && (
        <form
          className="space-y-3 mt-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (busy) return
            setBusy(true)
            try {
              await captureApi.saveTemplate(form, editing)
              await refetch()
              setForm({ ...empty })
              setEditing(undefined)
            } catch (e) {
              report(e)
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className="field-label">
            {t('dc_name')}
            <input
              className="field-input"
              required
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field-label">
              {t('amount')}
              <input
                className="field-input"
                required
                type="number"
                min="0.01"
                max="9999999999.99"
                step="0.01"
                value={form.amount || ''}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              />
            </label>
            <label className="field-label">
              {t('dc_type')}
              <select
                className="field-input"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as PinnedEntry['type'], categoryId: '' })
                }
              >
                <option value="expense">{t('expense')}</option>
                <option value="income">{t('income')}</option>
              </select>
            </label>
          </div>
          <label className="field-label">
            {t('category')}
            <select
              className="field-input"
              required
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">{t('dc_select')}</option>
              {categories
                ?.filter((c) => c.type === form.type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field-label">
            {t('dc_note')}
            <input
              className="field-input"
              maxLength={500}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
          {categoryError && (
            <p role="alert" className="text-expense text-xs">
              {categoryError}
            </p>
          )}
          <div className="flex gap-3 flex-wrap">
            <button disabled={busy || !!categoryError} className="primary-action" type="submit">
              {t('save')}
            </button>
            {editing && (
              <button
                type="button"
                disabled={busy}
                className="secondary-action"
                onClick={async () => {
                  setBusy(true)
                  try {
                    await captureApi.removeTemplate(editing)
                    await refetch()
                    setForm({ ...empty })
                    setEditing(undefined)
                  } catch (e) {
                    report(e)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {t('action_delete')}
              </button>
            )}
            <button
              type="button"
              className="text-action"
              onClick={() => {
                setForm({ ...empty })
                setEditing(undefined)
                setManage(false)
              }}
            >
              {t('action_cancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
