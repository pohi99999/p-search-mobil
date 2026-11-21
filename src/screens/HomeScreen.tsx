import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { Text, AnimatedFAB, MD3Colors, IconButton, Button } from 'react-native-paper';

import { AdBanner } from '../components/AdBanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TesterProgress } from '../components/TesterProgress';
import { HomeListHeader } from '../components/HomeListHeader';
import { AppearIn, APPEAR_MAX_STEPS } from '../components/AppearIn';
import { showTesterProgress } from '../config/env';

import { RootStackNavigationProp } from '../types/navigation';
import { useHomeData, MatchWithGrant } from '../hooks/useHomeData';
import { HomeEmptyState, type HomeEmptyStateKind } from '../components/HomeEmptyState';
import { HomeLoadError } from '../components/HomeLoadError';
import { missingProfileFields } from '../lib/profileCompleteness';
import { MatchCard } from '../components/MatchCard';
import { splitFreshAndStale } from '../lib/matchStatus';
import { HomeStatusHeader } from '../components/HomeStatusHeader';
import { useHomeStatus } from '../hooks/useHomeStatus';
import { isNewMatch } from '../lib/seenMatches';

/** FAB labels; the searching one must not be wider than the idle one (see the FAB below). */
export const FAB_IDLE_LABEL = 'Új AI-keresés';
export const FAB_SEARCHING_LABEL = 'Keresés…';
/** Card 4762e3d7: the collapsed section of the matches an earlier search found. */
export const staleSectionLabel = (n: number) => `Korábbi találatok (${n})`;

export function HomeScreen({ navigation }: { navigation: RootStackNavigationProp }) {
  const {
    loading,
    loadError,
    searching,
    lastSearch,
    hasSearched,
    profile,
    matches,
    isPro,
    fetchData,
    retryLoad,
    handleNewSearch
  } = useHomeData(navigation);

  // Card bc8e4135 (owner decision 2026-10-04): no ad inside the list, only the bottom banner.
  const insets = useSafeAreaInsets();
  const [bannerHeight, setBannerHeight] = useState(0);
  // The FAB sits above the bottom banner when it is shown, else above the navigation-bar inset.
  const fabBottom = (bannerHeight > 0 ? bannerHeight : insets.bottom) + 4;

  // vc23 (Lumen L3): a finished search scrolls the list to the top, where its summary line is.
  const listRef = useRef<FlatList<MatchWithGrant>>(null);
  useEffect(() => {
    if (lastSearch) listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [lastSearch]);

  // Card 4762e3d7: collapsed by default; open when there is nothing fresh, so the list is never just a header.
  const [staleOpen, setStaleOpen] = useState<boolean | null>(null);

  // Round 11-21 (#2, #4): the matches since the previous visit, and how fresh the grant list is. The freshness is read
  // again whenever the match list changes (a reload or a finished search).
  const { previousVisit, freshness } = useHomeStatus(profile?.user_id, matches);

  // Card [D]: which empty state; a search running wins over the other two.
  const emptyKind: HomeEmptyStateKind = searching ? 'searching' : hasSearched ? 'none' : 'never';
  // A failed reload keeps a list already on the screen. With nothing to show, the failure is named, and the search
  // button goes: it would start an AI search, or send a user whose profile was not read to the Onboarding.
  const failedKind = matches.length === 0 ? loadError : null;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={MD3Colors.primary50} />
        <Text style={styles.loadingText}>Adataid betöltése...</Text>
      </View>
    );
  }

  const renderCard = (item: MatchWithGrant, index: number) => (
    <MatchCard
      item={item}
      rank={index + 1}
      isNew={isNewMatch(item, previousVisit)}
      onPress={() => navigation.navigate('GrantDetail', { match: item, rank: index + 1 })}
    />
  );
  // vc23 (Lumen L3): the first cards come in one after the other; the rest (and the stale ones) appear as they are,
  // so scrolling a long list never waits for an entrance.
  const renderItem = ({ item, index }: { item: MatchWithGrant; index: number }) =>
    index <= APPEAR_MAX_STEPS ? <AppearIn index={index}>{renderCard(item, index)}</AppearIn> : renderCard(item, index);

  // Card 4762e3d7: the stale matches go under one collapsed header below the fresh ones; their rank continues the list.
  const { fresh, stale } = splitFreshAndStale(matches);
  const staleExpanded = staleOpen ?? fresh.length === 0;
  // Péter's test 2026-11-07: pinned above the list, the card took the phone's height from the matches. It scrolls away now.
  const testerProgress = showTesterProgress() ? <TesterProgress /> : null;
  const newCount = matches.filter((m) => isNewMatch(m, previousVisit)).length;
  // vc23: one header component (Lumen L3 + Kenshin #2/#4): tester card, the last search's summary, the status lines.
  const listHeader = (
    <HomeListHeader showTester={showTesterProgress()} lastSearch={lastSearch}>
      <HomeStatusHeader newCount={newCount} freshness={freshness} />
    </HomeListHeader>
  );
  const staleSection = stale.length === 0 ? null : (
    <View style={styles.staleSection} testID="home-stale-section">
      <Button
        mode="text"
        icon={staleExpanded ? 'chevron-up' : 'chevron-down'}
        contentStyle={styles.staleToggleContent}
        onPress={() => setStaleOpen(!staleExpanded)}
        accessibilityRole="button"
        accessibilityState={{ expanded: staleExpanded }}
        accessibilityLabel={`${staleSectionLabel(stale.length)}, ${staleExpanded ? 'összecsukás' : 'kibontás'}`}
        testID="home-stale-toggle"
      >
        {staleSectionLabel(stale.length)}
      </Button>
      {staleExpanded &&
        stale.map((item, i) => (
          <React.Fragment key={item.id}>{renderCard(item, fresh.length + i)}</React.Fragment>
        ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text role="heading" aria-level={1} variant="titleMedium" style={styles.headerTitle}>
          Üdv, {profile?.company_name || 'Partnerünk'}! {isPro && '⭐ PRO'}
        </Text>
        <View style={styles.headerActions}>
          <IconButton
            icon="file-document-plus"
            size={22}
            onPress={() => navigation.navigate('DocumentUpload')}
            accessibilityLabel="Pénzügyi dokumentum feltöltése"
            testID="home-document-upload-button"
          />
          <IconButton
            icon="cog"
            size={22}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Beállítások megnyitása"
            testID="home-settings-button"
          />
        </View>
      </View>
      
      {failedKind ? (
        <>
          {testerProgress}
          <View style={styles.emptyContainer}>
            <HomeLoadError kind={failedKind} onRetry={() => void retryLoad()} />
          </View>
        </>
      ) : matches.length === 0 ? (
        <>
          {testerProgress}
          <View style={styles.emptyContainer}>
            <HomeEmptyState
              kind={emptyKind}
              profileIncomplete={missingProfileFields(profile).length > 0}
              onSearch={handleNewSearch}
              onEditProfile={() => navigation.navigate('Onboarding', { edit: true })}
              lastSearch={lastSearch}
            />
          </View>
        </>
      ) : (
        <FlatList<MatchWithGrant>
          data={fresh}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ref={listRef}
          ListHeaderComponent={listHeader}
          ListFooterComponent={staleSection}
          contentContainerStyle={[styles.listContent, { paddingBottom: 80 + fabBottom }]}
          refreshing={loading}
          onRefresh={fetchData}
        />
      )}

      {failedKind ? null : (
        // On a list always the round icon (Péter's test 2026-11-07, P2-3: the wide label sat on "Részletek"); MatchCard
        // keeps its buttons out of this column. The label comes back while a search runs and on the empty screen.
        <AnimatedFAB
          // While searching (Péter 10518): Paper's disabled FAB ignores `color` and greys the label out
          // (onSurfaceDisabled on surfaceDisabled), so the button stays enabled-looking and ignores presses instead.
          // The label must stay short: with iconMode="static" Paper places it at right = textWidth - 56 + 16, so a
          // label wider than ~112 px starts left of the button (measured on web: "Keresés folyamatban..." is 148 px
          // and ran 38 px out). The full sentence is in the accessibility label.
          icon={searching ? 'progress-clock' : 'magnify'}
          // Card [I]: the MD3 default label colour (onPrimaryContainer #21005D) on our blue was 3.73:1; white is 4.60:1.
          color="#FFFFFF"
          style={[styles.fab, { bottom: fabBottom }]}
          testID="new-search-fab"
          label={searching ? FAB_SEARCHING_LABEL : FAB_IDLE_LABEL}
          extended={matches.length === 0 || Boolean(searching)}
          animateFrom="right"
          iconMode="static"
          onPress={() => { if (!searching) void handleNewSearch(); }}
          accessibilityLabel={searching ? 'Keresés folyamatban' : 'Új AI keresés indítása'}
          accessibilityState={{ busy: Boolean(searching), disabled: Boolean(searching) }}
        />
      )}
      
      <AdBanner onHeightChange={setBannerHeight} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    elevation: 2,
    marginBottom: 8,
  },
  headerTitle: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 80,
  },
  staleSection: {
    marginTop: 8,
  },
  staleToggleContent: {
    // the chevron after the label, the whole row a 48 dp touch target
    flexDirection: 'row-reverse',
    minHeight: 48,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    backgroundColor: '#1976D2',
  },
});
