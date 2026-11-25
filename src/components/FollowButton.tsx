import React, { useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from 'react-native-paper';
import type { MatchWithGrant } from '../hooks/useHomeData';
import { useFollowed } from '../hooks/useFollowed';
import { FREE_FOLLOW_LIMIT, followGrant, unfollowGrant } from '../lib/followedGrants';
import { notify } from '../lib/notify';

interface FollowButtonProps {
  match: MatchWithGrant;
  userId: string | null | undefined;
  isPro: boolean;
  /** Opens the paywall when a free account reaches the limit. */
  onOpenPaywall: () => void;
  style?: StyleProp<ViewStyle>;
}

export const FOLLOW_LABEL = 'Követem';
export const FOLLOWING_LABEL = 'Követed';
export const FOLLOW_LIMIT_TITLE = `Legfeljebb ${FREE_FOLLOW_LIMIT} pályázatot követhetsz`;
export const FOLLOW_LIMIT_MESSAGE =
  `Ingyenes fiókkal ${FREE_FOLLOW_LIMIT} pályázatot követhetsz egyszerre. Ha egyet elengedsz, jöhet a következő; ` +
  'a Pro-val korlátlanul követhetsz.';

/**
 * Round 11-21 (#5): follow or unfollow this grant. The followed ones are on "Saját pályázataim" with their deadline.
 * Without a user id (profile not read yet) the button is not shown.
 */
export function FollowButton({ match, userId, isPro, onOpenPaywall, style }: FollowButtonProps) {
  const { followed } = useFollowed(userId);
  const [busy, setBusy] = useState(false);
  if (!userId) return null;
  const isFollowed = followed.some((f) => f.grantId === match.grant_id);
  const title = match.grants?.title || 'a pályázat';

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isFollowed) {
        await unfollowGrant(userId, match.grant_id);
        return;
      }
      const result = await followGrant(userId, match, isPro);
      if (result === 'limit') {
        notify(FOLLOW_LIMIT_TITLE, FOLLOW_LIMIT_MESSAGE, [
          { text: 'Rendben', style: 'cancel' },
          { text: 'Pro megnézése', onPress: onOpenPaywall },
        ]);
      }
    } catch {
      notify('Nem sikerült menteni', 'A követést nem tudtuk elmenteni. Ellenőrizd az internetkapcsolatot, és próbáld újra.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      mode={isFollowed ? 'contained-tonal' : 'outlined'}
      icon={isFollowed ? 'bookmark-check' : 'bookmark-outline'}
      onPress={() => void onPress()}
      disabled={busy}
      style={[styles.button, style]}
      accessibilityLabel={isFollowed ? `${FOLLOWING_LABEL}: ${title}. Követés leállítása` : `${FOLLOW_LABEL}: ${title}`}
      accessibilityState={{ selected: isFollowed, busy }}
      testID="follow-button"
    >
      {isFollowed ? FOLLOWING_LABEL : FOLLOW_LABEL}
    </Button>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
  },
});
