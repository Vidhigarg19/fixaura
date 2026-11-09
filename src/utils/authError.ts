import { t } from '../i18n'

/**
 * Maps a Supabase auth error to translated copy. The raw English message from the
 * backend is never shown, so Hindi users do not get mixed-language errors.
 */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  switch (code) {
    case 'invalid_credentials':
      return t('auth.errorInvalidCredentials')
    case 'email_not_confirmed':
      return t('auth.errorEmailNotConfirmed')
    case 'user_already_exists':
    case 'email_exists':
      return t('auth.errorUserExists')
    case 'weak_password':
      return t('auth.errorWeakPassword')
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
      return t('auth.errorRateLimit')
    default:
      return t('auth.errorGeneric')
  }
}
