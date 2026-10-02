// Adding floats (e.g. quick-add chips) can drift past 2 decimals
// (0.1 + 0.2 === 0.30000000000000004). Round through this first.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** `1234.5` → `"1,234.50"`. Thai grouping, always two decimals. */
export function fmt(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * `1234.5` → `"1,235"`. For headline figures where decimals add noise without
 * changing the decision — a daily allowance reads better as a whole baht.
 */
export function fmtRound(n: number): string {
  return Math.round(n).toLocaleString('th-TH')
}
