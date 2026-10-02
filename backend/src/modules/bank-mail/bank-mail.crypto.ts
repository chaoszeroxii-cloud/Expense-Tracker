import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

export function mailKey(): Buffer {
  const text = process.env.BANK_MAIL_ENCRYPTION_KEY ?? ''
  const key = Buffer.from(text, 'base64')
  if (key.length !== 32 || key.toString('base64') !== text) throw new Error('mail_not_configured')
  return key
}
export function sealMailSecret(value: string, owner: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', mailKey(), iv)
  cipher.setAAD(Buffer.from(owner))
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}
export function openMailSecret(value: string, owner: string): string {
  const [version, iv, tag, data, extra] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !data || extra) throw new Error('invalid_mail_secret')
  const decipher = createDecipheriv('aes-256-gcm', mailKey(), Buffer.from(iv, 'base64url'))
  decipher.setAAD(Buffer.from(owner))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}
