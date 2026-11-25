import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, Card, Icon, IconButton, Text, TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBilling } from '../context/BillingContext';
import { useProfile } from '../context/ProfileContext';
import { useFollowed } from '../hooks/useFollowed';
import type { MatchWithGrant } from '../hooks/useHomeData';
import { formatDeadline } from '../lib/deadline';
import { FREE_FOLLOW_LIMIT, sortByDeadline, unfollowGrant, type FollowedGrant } from '../lib/followedGrants';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import type { FollowedGrantsScreenProps } from '../types/navigation';
import { BRAND_BLUE } from '../config/brand';

export const FOLLOWED_TITLE = 'Saját pályázataim';
export const FOLLOWED_EMPTY =
  'Még nem követsz pályázatot. Egy pályázat részleteinél a „Követem” gombbal veheted fel, és itt látod, mennyi idő van a beadásig.';
/** Round 6 (P2-4): the way on from the empty list. */
export const FOLLOWED_EMPTY_ACTION = 'Vissza a találatokhoz';
export const followedCountLine = (n: number, isPro: boolean) =>
  isPro ? `${n} követett pályázat` : `${n} / ${FREE_FOLLOW_LIMIT} követett pályázat (ingyenes fiók)`;
export const CLOSED_AT_SOURCE = 'A kiírás lezárult a forrásnál';

type GrantRow = MatchWithGrant['grants'] & { source_closed_at?: string | null };

/**
 * Round 11-21 (#5): the grants the user follows, the nearest deadline first. The stored matches open the detail view;
 * each grant's deadline and closed state are read again from the grants table, so the countdown is today's.
 */
export function FollowedGrantsScreen({ navigation }: FollowedGrantsScreenProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const { isPro } = useBilling();
  const userId = profile?.user_id;
  const { followed, loaded } = useFollowed(userId);
  const [fresh, setFresh] = useState<Record<string, GrantRow>>({});

  const ids = useMemo(() => followed.map((f) => f.grantId).sort().join(','), [followed]);
  useEffect(() => {
    if (!ids) return;
    let alive = true;
    void (async () => {
      try {
        const { data, error } = await supabase.from('grants').select('*').in('id', ids.split(','));
        if (error) throw error;
        if (!alive) return;
        const byId: Record<string, GrantRow> = {};
        for (const g of (data ?? []) as GrantRow[]) byId[g.id] = g;
        setFresh(byId);
      } catch (err) {
        // The stored copy stays on screen; the countdown is then as of the day it was followed.
        logger.warn('A követett pályázatok frissítése nem sikerült:', err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ids]);

  const items: FollowedGrant[] = useMemo(
    () =>
      sortByDeadline(
        followed.map((f) => (fresh[f.grantId] ? { ...f, match: { ...f.match, grants: { ...f.match.grants, ...fresh[f.grantId] } } } : f)),
      ),
    [followed, fresh],
  );

  const renderItem = ({ item }: { item: FollowedGrant }) => {
    const grant = item.match.grants as GrantRow | undefined;
    const title = grant?.title || 'Ismeretlen pályázat';
    const deadline = formatDeadline(grant?.deadline);
    const closed = !!grant?.source_closed_at;
    return (
      <Card style={styles.card} mode="elevated">
        <View style={styles.row}>
          <TouchableRipple
            onPress={() => navigation.navigate('GrantDetail', { match: item.match })}
            style={styles.open}
            accessibilityRole="button"
            accessibilityHint="Megnyitja a részleteket"
            testID="followed-open"
          >
            <View>
              <Text variant="titleMedium" numberOfLines={3} style={styles.title}>
                {title}
              </Text>
              <Text variant="labelLarge" style={[styles.deadline, deadlineStyles[closed ? 'expired' : deadline.tone]]} testID="followed-deadline">
                {closed ? CLOSED_AT_SOURCE : deadline.label}
              </Text>
            </View>
          </TouchableRipple>
          <IconButton
            icon="bookmark-remove"
            size={24}
            onPress={() => {
              if (userId) void unfollowGrant(userId, item.grantId);
            }}
            accessibilityLabel={`Követés leállítása: ${title}`}
            testID="followed-remove"
          />
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
          accessibilityLabel="Vissza"
          testID="followed-back-button"
        />
        <Text role="heading" aria-level={1} variant="titleLarge" style={styles.headerTitle}>
          {FOLLOWED_TITLE}
        </Text>
      </View>
      {loaded && items.length === 0 ? (
        // Round 6 (Lumen P2-4): the empty list had only a line of text, and no way on but the back arrow.
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon source="bookmark-outline" size={40} color="#1A237E" />
          </View>
          <Text variant="bodyLarge" style={styles.emptyText} testID="followed-empty">
            {FOLLOWED_EMPTY}
          </Text>
          <Button
            mode="outlined"
            icon="magnify"
            // BRAND_BLUE: 5.27:1 on this #f5f5f5 page (the old #1976D2 was 4.22:1 here).
            textColor={BRAND_BLUE}
            onPress={() => navigation.navigate('Home')}
            style={styles.emptyButton}
            contentStyle={styles.emptyButtonContent}
            testID="followed-empty-home"
          >
            {FOLLOWED_EMPTY_ACTION}
          </Button>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(f) => f.grantId}
          renderItem={renderItem}
          ListHeaderComponent={
            items.length > 0 ? (
              <Text variant="bodySmall" style={styles.count} testID="followed-count">
                {followedCountLine(items.length, isPro)}
              </Text>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: 'white', elevation: 2, marginBottom: 8 },
  // Round 6 (Lumen P2-4): the same heading as the detail and the settings screens (navy, bold; #1A237E is 13.24:1 on white).
  headerTitle: { flex: 1, fontWeight: 'bold', color: '#1A237E' },
  card: { marginHorizontal: 16, marginVertical: 6, backgroundColor: 'white' },
  row: { flexDirection: 'row', alignItems: 'center' },
  open: { flex: 1, padding: 16, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  title: { marginBottom: 6 },
  deadline: { fontWeight: 'bold' },
  // #555555 on #f5f5f5: 6.8:1.
  count: { color: '#555555', marginHorizontal: 16, marginBottom: 4 },
  empty: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { marginBottom: 12 },
  emptyText: { textAlign: 'center', color: '#424242', maxWidth: 420 },
  emptyButton: { marginTop: 20 },
  emptyButtonContent: { minHeight: 44 },
});

// The deadline colours of MatchCard ([A]).
const deadlineStyles = StyleSheet.create({
  expired: { color: '#B71C1C' },
  soon: { color: '#A15C00' },
  normal: { color: '#424242' },
  unknown: { color: '#616161', fontWeight: 'normal' },
});
