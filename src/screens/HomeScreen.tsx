import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { Text, Button, AnimatedFAB, MD3Colors, IconButton } from 'react-native-paper';

import { AdBanner } from '../components/AdBanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TesterProgress } from '../components/TesterProgress';

import { RootStackNavigationProp } from '../types/navigation';
import { useHomeData, MatchWithGrant } from '../hooks/useHomeData';
import { HomeEmptyState, type HomeEmptyStateKind } from '../components/HomeEmptyState';
import { missingProfileFields } from '../lib/profileCompleteness';
import { MatchCard } from '../components/MatchCard';

/** FAB labels; the searching one must not be wider than the idle one (see the FAB below). */
export const FAB_IDLE_LABEL = 'Új AI-keresés';
export const FAB_SEARCHING_LABEL = 'Keresés…';

export function HomeScreen({ navigation }: { navigation: RootStackNavigationProp }) {
  const {
    loading,
    searching,
    hasSearched,
    profile,
    matches,
    isPro,
    fetchData,
    signOut,
    handleNewSearch
  } = useHomeData(navigation);

  // Card bc8e4135 (owner decision 2026-10-04): no ad inside the list, only the bottom banner.
  const insets = useSafeAreaInsets();
  const [bannerHeight, setBannerHeight] = useState(0);
  // The search button: extended at the top of the list, its round icon once scrolled (card a96dd8e2 #9).
  const [fabExtended, setFabExtended] = useState(true);
  // The FAB sits above the bottom banner when it is shown, else above the navigation-bar inset.
  const fabBottom = (bannerHeight > 0 ? bannerHeight : insets.bottom) + 4;

  // Card [D]: which empty state; a search running wins over the other two.
  const emptyKind: HomeEmptyStateKind = searching ? 'searching' : hasSearched ? 'none' : 'never';

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={MD3Colors.primary50} />
        <Text style={styles.loadingText}>Adataid betöltése...</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: MatchWithGrant }) => (
    <MatchCard
      item={item}
      onPress={() => navigation.navigate('GrantDetail', { match: item })}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="titleMedium" style={styles.headerTitle}>
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
          <Button mode="text" onPress={signOut} compact accessibilityLabel="Kijelentkezés">
            Kijelentkezés
          </Button>
        </View>
      </View>
      
      <TesterProgress />
      
      {matches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <HomeEmptyState
            kind={emptyKind}
            profileIncomplete={missingProfileFields(profile).length > 0}
            onSearch={handleNewSearch}
            onEditProfile={() => navigation.navigate('Onboarding', { edit: true })}
          />
        </View>
      ) : (
        <FlatList<MatchWithGrant>
          data={matches}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: 80 + fabBottom }]}
          onScroll={({ nativeEvent }) => setFabExtended(nativeEvent.contentOffset.y <= 8)}
          scrollEventThrottle={64}
          refreshing={loading}
          onRefresh={fetchData}
        />
      )}
      
      {/* Extended only at the top of the list; once scrolled it is the round icon, so it covers far less of
          the cards (card a96dd8e2 #9: the wide label covered the 2nd card's text). */}
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
        extended={fabExtended || Boolean(searching)}
        animateFrom="right"
        iconMode="static"
        onPress={() => { if (!searching) void handleNewSearch(); }}
        accessibilityLabel={searching ? 'Keresés folyamatban' : 'Új AI keresés indítása'}
        accessibilityState={{ busy: Boolean(searching), disabled: Boolean(searching) }}
      />
      
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
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    backgroundColor: '#1976D2',
  },
});
