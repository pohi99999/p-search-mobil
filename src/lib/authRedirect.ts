// Round 6, item E3 (Péter 18328 via Marveen 9160): the link in the sign-up confirmation e-mail opens the web version
// with the result in the URL fragment (Supabase implicit flow, redirect to the project's Site URL):
//   success: #access_token=…&expires_at=…&expires_in=3600&refresh_token=…&token_type=bearer&type=signup
//   failure: #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
// (the success shape was read from a real confirmation on 2026-11-25). The client has detectSessionInUrl off, so the
// fragment used to be ignored: the user saw the plain sign-in screen, with a valid session token left in the address bar.
//
// Pure module: no window, no Supabase, so the parsing is tested without a browser.

export type AuthRedirect =
  | { kind: 'signup-confirmed'; accessToken: string; refreshToken: string }
  | { kind: 'link-error'; code: string };

/**
 * Recognises a sign-up confirmation (needs `type=signup` and both tokens) or a failed link (`error` /
 * `error_code`). Anything else returns null and must be left alone: a password recovery has its own page
 * (public/reset-password.html), and a fragment that is not an auth result is none of ours.
 */
export function parseAuthRedirect(hash: string): AuthRedirect | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);

  const error = params.get('error');
  const errorCode = params.get('error_code');
  if (error || errorCode) return { kind: 'link-error', code: errorCode || error || 'unknown' };

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (params.get('type') === 'signup' && accessToken && refreshToken) {
    return { kind: 'signup-confirmed', accessToken, refreshToken };
  }
  return null;
}

export const LINK_ERROR_TITLE = 'A megerősítő link nem használható';
export const LINK_ERROR_MESSAGE =
  'A link lejárt, vagy már felhasználták. Ha már megerősítetted a címed, jelentkezz be. Ha nem, próbálj meg újra regisztrálni ugyanezzel az e-mail címmel.';
