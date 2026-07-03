// Adding floats (e.g. quick-add chips) can drift past 2 decimals
// (0.1 + 0.2 === 0.30000000000000004). Round through this first.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
