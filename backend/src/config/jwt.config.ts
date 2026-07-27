/**
 * Resolve the JWT signing secret.
 *
 * In production a strong secret (>= 32 chars) is mandatory — we refuse to boot
 * with the well-known dev fallback, otherwise anyone could forge tokens for any
 * user. Outside production we allow a fallback so local dev keeps working.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  const isProd = process.env.NODE_ENV === 'production'

  if (isProd) {
    if (!secret || secret.length < 32) {
      throw new Error(
        'JWT_SECRET must be set to a strong value (at least 32 characters) in production',
      )
    }
    return secret
  }

  return secret || 'dev-secret-change-in-production'
}
