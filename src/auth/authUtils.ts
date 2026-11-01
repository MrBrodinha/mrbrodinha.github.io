export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;
export const MIN_PASSWORD_LENGTH = 8;

export function validUsername(value: unknown): value is string {
  return typeof value === 'string' && USERNAME_PATTERN.test(value);
}

export function safeReturnPath(value: string | null): string {
  return value === '/redbull' || value === '/brodle' || value === '/brodle/create' || value === '/brodle/melodies' || value === '/brodle/admin' ? value : '/account';
}

export function authRedirect(path: '/auth/callback' | '/auth/reset-password'): string {
  return new URL(path, window.location.origin).href;
}

// Do not display raw service errors: they may contain identifiers or internals.
export function authErrorMessage(error: { code?: string; status?: number } | null | undefined): string {
  switch (error?.code) {
    case 'invalid_credentials': return 'Email or password is incorrect.';
    case 'email_not_confirmed': return 'Confirm your email before signing in. You can resend the confirmation below.';
    case 'user_already_exists': case 'email_exists': return 'Unable to create this account. Try signing in or resetting your password.';
    case 'weak_password': return 'Choose a stronger password with at least 8 characters.';
    case 'same_password': return 'Choose a password different from your current password.';
    case 'over_email_send_rate_limit': case 'over_request_rate_limit': return 'Too many requests. Please wait a minute and try again.';
    case 'email_address_not_authorized': case 'email_address_invalid': return 'Unable to send email to this address. Check the address or contact the site owner.';
    case 'signup_disabled': return 'New accounts are temporarily unavailable.';
    case 'otp_expired': case 'otp_disabled': return 'This email link has expired or has already been used. Request a new one.';
    case 'session_not_found': case 'refresh_token_not_found': case 'refresh_token_already_used': return 'Your session has expired. Please sign in again.';
    case 'unexpected_failure': return 'The account service could not complete this request. Please try again later.';
    default: return error?.status && error.status >= 500 ? 'The account service could not complete this request. Please try again later.' : error?.status === 429 ? 'Too many requests. Please wait a minute and try again.' : 'Unable to complete this request. Please check your connection and try again.';
  }
}

// Auth intentionally hides database constraint details. Never claim a specific
// username collision unless verified; the existing trigger/index enforce it.
export function signupErrorMessage(error: { code?: string; status?: number; message?: string }): string {
  if (error.code === 'unexpected_failure' || /database error saving new user/i.test(error.message ?? '')) {
    return 'Unable to create this account. That username may already be taken. Try a different username; if this continues, contact the site owner.';
  }
  return authErrorMessage(error);
}

export function returnLinkError(search: string, hash: string): string | null {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  if (![query, fragment].some((params) => params.has('error') || params.has('error_code'))) return null;
  return authErrorMessage({ code: query.get('error_code') ?? fragment.get('error_code') ?? 'otp_expired' });
}
