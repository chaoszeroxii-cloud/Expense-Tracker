import axios from 'axios'
import type { TKey } from '../store/i18n.store'

// Translate known API failures without exposing arbitrary provider responses.
// The backend still verifies token ownership and refuses automatic account linking.
const messages: Record<string, TKey> = {
  'Google sign-in is not configured': 'social_google_unavailable',
  'Facebook sign-in is not configured': 'social_facebook_unavailable',
  'Google token audience mismatch': 'social_config_mismatch',
  'Facebook token was not issued for this app': 'social_config_mismatch',
  'The provider must supply a verified email. Use email and password sign-in instead.': 'social_email_required',
  'Email ownership could not be verified. Recover this account by email.': 'social_email_recovery',
  'Use the original sign-in method for this email, or reset your password. Accounts are not linked automatically.': 'social_original_method',
}

export function socialLoginErrorKey(error: unknown): TKey {
  if (!axios.isAxiosError(error)) return 'social_login_failed'
  if (!error.response) return 'err_offline'
  if (error.response.status === 429) return 'social_too_many_attempts'
  const message = error.response.data?.message
  return typeof message === 'string' && Object.prototype.hasOwnProperty.call(messages, message)
    ? messages[message]
    : 'social_login_failed'
}
