import React from 'react';
import { EmailConfirmedView } from './EmailConfirmedView';
import { WebFrame } from './WebFrame';
import { useAuthRedirect, type AuthRedirectEnv } from '../hooks/useAuthRedirect';
import { PLAY_LISTING_PUBLIC } from '../config/launch';

interface Props {
  children: React.ReactNode;
  /** Tests only: where the URL fragment comes from. */
  env?: AuthRedirectEnv;
}

/**
 * Round 6, item E3: in front of the navigator, the "Az e-mail címed megerősítve" view while the user has just come
 * from the confirmation e-mail's link (web only); the navigator otherwise. The view is Lumen's
 * (EmailConfirmedView, a pure view); the recognising, the session and the URL clean-up are in useAuthRedirect.
 */
export function EmailConfirmationGate({ children, env }: Props) {
  const { confirmed, signIn } = useAuthRedirect(env);
  if (confirmed) {
    return (
      <WebFrame>
        <EmailConfirmedView onSignIn={signIn} showPlayButton={PLAY_LISTING_PUBLIC} />
      </WebFrame>
    );
  }
  return <>{children}</>;
}
