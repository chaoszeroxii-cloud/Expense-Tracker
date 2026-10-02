const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const {
  ALLOWED_METHODS,
  DEFAULT_ORIGIN,
  getAllowedOrigins,
  getCorsOptions,
} = require('../dist/config/cors.config')

/**
 * A verb the client uses but CORS omits is invisible in dev — Vite proxies `/api`, so
 * local requests are same-origin and never preflight. It only surfaces in production, as
 * a bogus "you are offline" toast. This test reads the real API client and holds the
 * allow-list to it, so the mismatch is caught at build time instead of by a user.
 */
const apiClientPath = path.join(__dirname, '..', '..', 'frontend', 'src', 'api', 'index.ts')

test('every HTTP verb the frontend issues is allowed by CORS', () => {
  const source = fs.readFileSync(apiClientPath, 'utf8')

  // Matches `http.put(`, `http.get<Coverage>(`, etc.
  const verbs = new Set(
    [...source.matchAll(/\bhttp\.(get|post|put|patch|delete|head)\b/g)]
      .map(m => m[1].toUpperCase()),
  )

  assert.ok(verbs.size > 0, `no http.<verb>( calls found in ${apiClientPath}`)

  // Guards the regression directly: PUT backs saveTargets, budgets and daily check-ins.
  assert.ok(verbs.has('PUT'), 'expected the API client to still use PUT')

  for (const verb of [...verbs].sort()) {
    assert.ok(
      ALLOWED_METHODS.includes(verb),
      `frontend issues ${verb} but CORS allows only ${ALLOWED_METHODS.join(',')}`,
    )
  }
})

test('preflight always permits OPTIONS', () => {
  assert.ok(ALLOWED_METHODS.includes('OPTIONS'))
})

test('a single configured origin is passed through as a string', () => {
  const previous = process.env.CORS_ORIGIN
  process.env.CORS_ORIGIN = 'https://example.com'
  try {
    assert.equal(getCorsOptions().origin, 'https://example.com')
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGIN
    else process.env.CORS_ORIGIN = previous
  }
})

test('multiple origins are split and trimmed into a list', () => {
  const previous = process.env.CORS_ORIGIN
  process.env.CORS_ORIGIN = 'https://a.com, https://b.com'
  try {
    assert.deepEqual(getAllowedOrigins(), ['https://a.com', 'https://b.com'])
    assert.deepEqual(getCorsOptions().origin, ['https://a.com', 'https://b.com'])
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGIN
    else process.env.CORS_ORIGIN = previous
  }
})

test('an unset CORS_ORIGIN falls back to the local dev origin', () => {
  const previous = process.env.CORS_ORIGIN
  delete process.env.CORS_ORIGIN
  try {
    assert.deepEqual(getAllowedOrigins(), [DEFAULT_ORIGIN])
  } finally {
    if (previous !== undefined) process.env.CORS_ORIGIN = previous
  }
})
