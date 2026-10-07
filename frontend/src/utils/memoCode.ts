// Keep aligned with backend/common/memo-code.util.ts.
export function normalizeMemoCode(value: string): string | null {
  return value.trim().replace(/^#/, '').normalize('NFC').toLowerCase() || null
}

export function validMemoCode(value: string | null): boolean {
  return value === null || /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]{0,19}$/u.test(value)
}
