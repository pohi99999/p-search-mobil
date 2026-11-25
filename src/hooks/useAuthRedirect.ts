import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import { LINK_ERROR_MESSAGE, LINK_ERROR_TITLE, parseAuthRedirect, type AuthRedirect } from '../lib/authRedirect';

/** The browser side, injectable so the hook is tested without one. */
export interface AuthRedirectEnv {
  /** The URL fragment ("#…"), or '' where there is none (a phone, a server). */
  getHash: () => string;
  /** Removes the fragment from the address bar and the history entry, keeping path and query. */
  clearHash: () => void;
}

export const browserEnv: AuthRedirectEnv = {
  getHash: () => (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hash : ''),
  clearHash: () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  },
};

type Confirmed = Extract<AuthRedirect, { kind: 'signup-confirmed' }>;

/**
 * Round 6, item E3: the page the confirmation e-mail's link opens. Returns the confirmation (while the "Az e-mail
 * címed megerősítve" view is to be shown) and `signIn`, the view's button.
 *
 * - The fragment is read synchronously on the first render, so the sign-in screen never flashes first.
 * - It is removed from the address bar at once (an effect): the tokens must not stay in the URL, the history or a
 *   copied link, whatever the user does next.
 * - `signIn` takes the session the link brought (`setSession`; an expired access token is renewed from the refresh
 *   token). Without a session, or if it is refused, the view is simply dismissed and the sign-in screen follows.
 * - A failed link (expired, already used) is said in words through `notify`, over the sign-in screen.
 */
export function useAuthRedirect(env: AuthRedirectEnv = browserEnv): {
  confirmed: Confirmed | null;
  signIn: () => Promise<void>;
} {
  const [redirect] = useState<AuthRedirect | null>(() => parseAuthRedirect(env.getHash()));
  const [shown, setShown] = useState(redirect?.kind === 'signup-confirmed');

  useEffect(() => {
    if (!redirect) return;
    env.clearHash();
    if (redirect.kind === 'link-error') notify(LINK_ERROR_TITLE, LINK_ERROR_MESSAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the fragment read at mount
  }, []);

  const confirmed = redirect?.kind === 'signup-confirmed' && shown ? redirect : null;

  const signIn = useCallback(async () => {
    if (redirect?.kind === 'signup-confirmed') {
      try {
        const { error } = await supabase.auth.setSession({
          access_token: redirect.accessToken,
          refresh_token: redirect.refreshToken,
        });
        if (error) logger.warn('A megerősítő link munkamenete nem használható:', error.message);
      } catch (err) {
        logger.warn('A megerősítő link munkamenete nem használható:', err);
      }
    }
    setShown(false);
  }, [redirect]);

  return { confirmed, signIn };
}
