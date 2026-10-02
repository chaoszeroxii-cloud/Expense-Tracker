import type { EntryType } from '../types'

export interface CaptureDraft {
  type: EntryType
  amount?: number
  categoryId?: string
  note?: string
}

/** Router state is only a prefill. Validate it and check category ownership against the fetched list. */
export function readCaptureDraft(state: unknown): CaptureDraft | null {
  if (!state || typeof state !== 'object' || !('draft' in state)) return null
  const draft = state.draft
  if (
    !draft ||
    typeof draft !== 'object' ||
    !('type' in draft) ||
    (draft.type !== 'expense' && draft.type !== 'income')
  )
    return null
  return {
    type: draft.type,
    amount:
      'amount' in draft &&
      typeof draft.amount === 'number' &&
      Number.isFinite(draft.amount) &&
      draft.amount >= 0.01
        ? draft.amount
        : undefined,
    categoryId: 'categoryId' in draft && typeof draft.categoryId === 'string' ? draft.categoryId : undefined,
    note: 'note' in draft && typeof draft.note === 'string' ? draft.note.slice(0, 200) : undefined,
  }
}
