// JS float sums/subtractions over many 2-decimal values can drift
// (e.g. 15000.010000000002). Money values are always rounded through
// this before being returned from an API response.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
