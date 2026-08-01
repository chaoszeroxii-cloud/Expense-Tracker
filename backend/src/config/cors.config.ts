/**
 * Cross-origin rules for the browser client.
 *
 * This config only matters in the deployed topology, where the frontend (Vercel) and the
 * API (Render) are different origins. Local dev proxies `/api` through Vite, making every
 * request same-origin — so CORS is bypassed entirely and a broken allow-list here cannot
 * be reproduced on a developer machine. Treat this file as production-only code.
 *
 * A missing verb fails in the worst possible way: the preflight still answers 204, the
 * browser quietly declines to send the real request, and the client sees an error with no
 * response — indistinguishable from a dead network. That is why `ALLOWED_METHODS` lists
 * every verb the API exposes rather than only the ones a given feature happens to need.
 */
export const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

export const DEFAULT_ORIGIN = 'http://localhost:3000'

export function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || DEFAULT_ORIGIN).split(',').map(o => o.trim())
}

export function getCorsOptions() {
  const origins = getAllowedOrigins()
  return {
    origin: origins.length === 1 ? origins[0] : origins,
    methods: ALLOWED_METHODS,
  }
}
