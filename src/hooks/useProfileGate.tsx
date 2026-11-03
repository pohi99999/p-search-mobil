import React, { useCallback, useState } from 'react';
import { ProfileCompletionDialog } from '../components/profile/ProfileCompletionDialog';
import { useProfile } from '../context/ProfileContext';
import { missingProfileFields } from '../lib/profileCompleteness';
import type { BusinessProfile } from '../types/database';

// Profiles whose owner chose "Kihagyom" in this app session: not asked again until the app restarts.
const skippedThisSession = new Set<string>();
export const __resetProfileGateForTests = () => skippedThisSession.clear();

/**
 * gate(action): runs the action at once when the key fields are filled (or were skipped this session);
 * otherwise shows the ProfileCompletionDialog first, and runs the action after "Mentés és tovább" or
 * "Kihagyom" (card 431a496e). Render `dialog` somewhere in the screen.
 */
export function useProfileGate(profile: BusinessProfile | null | undefined) {
  const { refreshProfile } = useProfile();
  const [pending, setPending] = useState<(() => void) | null>(null);
  const missing = missingProfileFields(profile);

  const gate = useCallback((action: () => void) => {
    if (!profile || missing.length === 0 || skippedThisSession.has(profile.id)) { action(); return; }
    setPending(() => action);
  }, [profile, missing.length]);

  const run = () => { const a = pending; setPending(null); a?.(); };

  const dialog = pending && profile ? (
    <ProfileCompletionDialog
      visible
      profileId={profile.id}
      missing={missing}
      onSaved={async () => { await refreshProfile(); run(); }}
      onSkip={() => { skippedThisSession.add(profile.id); run(); }}
      onCancel={() => setPending(null)}
    />
  ) : null;

  return { gate, dialog };
}
