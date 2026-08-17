import React, { useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { Text, Button, FAB, MD3Colors, IconButton } from 'react-native-paper';
import { logger } from '../utils/logger';

import { AdBanner } from '../components/AdBanner';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { TesterProgress } from '../components/TesterProgress';

import { RootStackNavigationProp } from '../types/navigation';
import { useHomeData, MatchWithGrant } from '../hooks/useHomeData';
import { HomeEmptyState } from '../components/HomeEmptyState';
import { MatchCard } from '../components/MatchCard';

type AdItem = { type: 'ad'; id: string };
type FlatListItem = MatchWithGrant | AdItem;
const isAdItem = (item: FlatListItem): item is AdItem =>
  'type' in item && (item as AdItem).type === 'ad';
export function HomeScreen({ navigation }: { navigation: RootStackNavigationProp }) {
  const {
    loading,
    searching,
    profile,
    matches,
    isPro,
    fetchData,
    signOut,
    handleNewSearch
  } = useHomeData(navigation);

  const listData = useMemo<FlatListItem[]>(() => {
    if (!isPro && matches.length > 1) {
      return [
        matches[0],
        { type: 'ad' as const, id: 'inline-banner' },
        ...matches.slice(1),
      ];
    }
    return matches;
  }, [matches, isPro]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={MD3Colors.primary50} />
        <Text style={styles.loadingText}>Adataid betöltése...</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: FlatListItem }) => {
    if (isAdItem(item)) {
      return (
        <View style={styles.inlineBannerContainer}>
          <BannerAd
            unitId={TestIds.BANNER}
            size={BannerAdSize.BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
            onAdFailedToLoad={(error) => logger.warn('Inline banner failed to load:', error)}
          />
        </View>
      );
    }
    return (
      <MatchCard
        item={item as MatchWithGrant}
        onPress={() => navigation.navigate('ActionPlan', { matchId: item.id })}
      />
    );
  };

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
          <HomeEmptyState industryCode={profile?.industry_code} onRefresh={fetchData} />
        </View>
      ) : (
        <FlatList<FlatListItem>
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={fetchData}
        />
      )}
      
      <FAB
        icon={searching ? 'progress-clock' : 'magnify'}
        style={[styles.fab, { bottom: isPro ? 20 : 80 }]}
        label={searching ? 'Keresés folyamatban...' : 'Új AI Keresés'}
        onPress={handleNewSearch}
        disabled={searching}
        loading={searching}
        accessibilityLabel="Új AI keresés indítása"
      />
      
      <AdBanner />
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
  inlineBannerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 1,
    minHeight: 50,
  },
});
