/** Shared category-write and bank-import rules. No fuzzy matching of financial data. */
export const MEMO_CODE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]{0,19}$/u

export function normalizeMemoCode(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value.trim().replace(/^#/, '').normalize('NFC').toLowerCase() || null
}

type CodeCategory = { id: string; type: 'expense' | 'income'; memoCode?: string | null }
export type MemoCategoryHint = {
  categoryId: string | null
  code: string | null
  issue: 'memo_code_unknown' | 'memo_code_multiple' | 'memo_code_type_mismatch' | null
}

export function matchMemoCategory(memo: string | undefined, type: CodeCategory['type'], categories: CodeCategory[]): MemoCategoryHint | null {
  // Whitespace or an opening bracket starts a token. URLs and text#fragments
  // are ordinary text. Consume the whole token so #food-extra never matches #food.
  const matches = [...(memo ?? '').matchAll(/(?:^|[\s([{])#([^\s()[\]{},.!?;:，。！？]+)/gu)]
  const tokens = matches.map(match => match[1].normalize('NFC').toLowerCase())
  const codes = [...new Set(tokens)]
  if (!codes.length) return null
  if (codes.length !== 1) return { categoryId: null, code: null, issue: 'memo_code_multiple' }
  const code = codes[0]
  // The parser caps memos at 400 UTF-16 units (399 if it drops a split surrogate).
  // A token may be cut, or a second code lost beyond that limit. Review instead.
  if (memo.length >= 399) {
    return { categoryId: null, code: code.slice(0, 20), issue: 'memo_code_unknown' }
  }
  const found = MEMO_CODE_PATTERN.test(code) && categories.find(category => category.memoCode === code)
  if (!found) return { categoryId: null, code: code.slice(0, 20), issue: 'memo_code_unknown' }
  if (found.type !== type) return { categoryId: null, code, issue: 'memo_code_type_mismatch' }
  return { categoryId: found.id, code, issue: null }
}
