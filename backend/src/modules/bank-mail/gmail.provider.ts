import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { createHash } from 'crypto'
import { mailKey } from './bank-mail.crypto'
import { BANK_MAIL_QUERY, GmailMessage } from './bank-mail.parser'

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'
export class GmailFailure extends Error {}

@Injectable()
export class GmailProvider {
  configured(): boolean {
    try {
      mailKey()
      const redirect = new URL(process.env.GMAIL_REDIRECT_URI)
      const front = new URL(process.env.FRONTEND_URL)
      const local = (url: URL) => url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
      return !!process.env.GMAIL_CLIENT_ID && !!process.env.GMAIL_CLIENT_SECRET
        && local(redirect) && local(front) && !redirect.username && !front.username
        && redirect.pathname === '/api/bank-mail/gmail/callback' && !redirect.search && !redirect.hash
        && front.pathname === '/' && !front.search && !front.hash
    } catch { return false }
  }
  authorizationUrl(state: string, verifier: string): string {
    const q = new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID, redirect_uri: process.env.GMAIL_REDIRECT_URI,
      response_type: 'code', scope: SCOPE, state, access_type: 'offline', prompt: 'consent select_account',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    })
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + q
  }
  private async token(values: Record<string, string>) {
    try {
      const { data } = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET, ...values,
      }), { timeout: 8000, maxContentLength: 64_000, maxRedirects: 0 })
      if (typeof data.access_token !== 'string') throw new GmailFailure('gmail_unavailable')
      if (data.scope && !data.scope.split(' ').includes(SCOPE)) throw new GmailFailure('reconnect_required')
      return data as { access_token: string; refresh_token?: string }
    } catch (error) {
      if (error instanceof GmailFailure) throw error
      throw new GmailFailure(error.response?.data?.error === 'invalid_grant' ? 'reconnect_required' : 'gmail_unavailable')
    }
  }
  async exchange(code: string, verifier: string) {
    const tokens = await this.token({ code, code_verifier: verifier, redirect_uri: process.env.GMAIL_REDIRECT_URI, grant_type: 'authorization_code' })
    if (!tokens.refresh_token) throw new GmailFailure('reconnect_required')
    const profile = await this.get<{ emailAddress: string }>('/profile', tokens.access_token)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.emailAddress) || profile.emailAddress.length > 320) throw new GmailFailure('gmail_unavailable')
    return { address: profile.emailAddress.toLowerCase(), refreshToken: tokens.refresh_token }
  }
  async refresh(refreshToken: string): Promise<string> {
    return (await this.token({ refresh_token: refreshToken, grant_type: 'refresh_token' })).access_token
  }
  private async get<T>(path: string, accessToken: string, params?: Record<string, unknown>): Promise<T> {
    try {
      return (await axios.get<T>(API + path, { headers: { Authorization: `Bearer ${accessToken}` }, params,
        timeout: 6000, maxContentLength: 2_000_000, maxRedirects: 0 })).data
    } catch (error) {
      throw new GmailFailure(error.response?.status === 401 ? 'reconnect_required'
        : error.response?.status === 404 && path.startsWith('/messages/') ? 'message_gone'
        : error.response?.status === 400 && params?.pageToken ? 'page_expired'
        : error.response?.status === 429 ? 'rate_limited' : 'gmail_unavailable')
    }
  }
  list(accessToken: string, after: Date, before: Date, pageToken?: string) {
    return this.get<{ messages?: { id: string }[]; nextPageToken?: string }>('/messages', accessToken, {
      q: `${BANK_MAIL_QUERY} after:${Math.floor(after.getTime() / 1000)} before:${Math.ceil(before.getTime() / 1000)}`,
      maxResults: 5, ...(pageToken ? { pageToken } : {}),
    })
  }
  message(accessToken: string, id: string): Promise<GmailMessage> {
    if (!/^[a-f0-9]{1,128}$/i.test(id)) throw new GmailFailure('gmail_unavailable')
    return this.get('/messages/' + id, accessToken, { format: 'full' })
  }
  async revoke(refreshToken: string): Promise<boolean> {
    try {
      await axios.post('https://oauth2.googleapis.com/revoke', new URLSearchParams({ token: refreshToken }),
        { timeout: 5000, maxContentLength: 64000, maxRedirects: 0 })
      return true
    } catch { return false }
  }
}
