import { LINK_ERROR_MESSAGE, LINK_ERROR_TITLE, parseAuthRedirect } from '../authRedirect';

// The success shape is the one a real confirmation brought on 2026-11-25 (tokens shortened here).
const SUCCESS = '#access_token=eyJhbGciOi.payload.sig&expires_at=1795605312&expires_in=3600&refresh_token=tf2bunuh3km3&sb=&token_type=bearer&type=signup';
const EXPIRED = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';

describe('parseAuthRedirect (round 6, E3)', () => {
  it('a sign-up confirmation yields both tokens', () => {
    expect(parseAuthRedirect(SUCCESS)).toEqual({
      kind: 'signup-confirmed',
      accessToken: 'eyJhbGciOi.payload.sig',
      refreshToken: 'tf2bunuh3km3',
    });
  });

  it('the leading # is optional', () => {
    expect(parseAuthRedirect(SUCCESS.slice(1))?.kind).toBe('signup-confirmed');
  });

  it('a failed link yields its code, or the plain error when there is no code', () => {
    expect(parseAuthRedirect(EXPIRED)).toEqual({ kind: 'link-error', code: 'otp_expired' });
    expect(parseAuthRedirect('#error=access_denied')).toEqual({ kind: 'link-error', code: 'access_denied' });
    expect(parseAuthRedirect('#error_code=otp_expired')).toEqual({ kind: 'link-error', code: 'otp_expired' });
  });

  it('is not fooled: a confirmation needs type=signup AND both tokens', () => {
    expect(parseAuthRedirect('#access_token=a&refresh_token=r&type=recovery')).toBeNull();
    expect(parseAuthRedirect('#access_token=a&refresh_token=r')).toBeNull();
    expect(parseAuthRedirect('#access_token=a&type=signup')).toBeNull();
    expect(parseAuthRedirect('#refresh_token=r&type=signup')).toBeNull();
    expect(parseAuthRedirect('#access_token=&refresh_token=r&type=signup')).toBeNull();
  });

  it('leaves a password recovery and any other fragment alone (null)', () => {
    expect(parseAuthRedirect('#access_token=a&refresh_token=r&type=recovery&token_type=bearer')).toBeNull();
    expect(parseAuthRedirect('#access_token=a&refresh_token=r&type=email_change')).toBeNull();
    expect(parseAuthRedirect('#section-2')).toBeNull();
    expect(parseAuthRedirect('#')).toBeNull();
    expect(parseAuthRedirect('')).toBeNull();
  });

  it('an error wins over tokens (a half-valid fragment must not sign anyone in)', () => {
    expect(parseAuthRedirect('#error=access_denied&access_token=a&refresh_token=r&type=signup')?.kind).toBe('link-error');
  });

  it('the failed-link text names no promise it cannot keep', () => {
    expect(LINK_ERROR_TITLE).toBe('A megerősítő link nem használható');
    expect(LINK_ERROR_MESSAGE).toMatch(/lejárt|felhasználták/);
    expect(LINK_ERROR_MESSAGE).not.toMatch(/új levél|kapsz/);
  });
});
