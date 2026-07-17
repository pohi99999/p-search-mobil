import React, { useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { Text, Button, FAB, MD3Colors } from 'react-native-paper';
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
    profile,
    matches,
    isPro,
    fetchData,
    signOut,
    handleNewSearch
  } = useHomeData(navigation);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={MD3Colors.primary50} />
        <Text style={{ marginTop: 16 }}>Adataid betöltése...</Text>
      </View>
    );
  }

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
        <Text variant="titleMedium" style={{ flex: 1 }}>
          Üdv, {profile?.company_name || 'Partnerünk'}! {isPro && '⭐ PRO'}
        </Text>
        <Button mode="text" onPress={signOut} compact>
          Kijelentkezés
        </Button>
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
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshing={loading}
          onRefresh={fetchData}
        />
      )}
      
      <FAB
        icon="magnify"
        style={[styles.fab, { bottom: isPro ? 20 : 80 }]}
        label="Új AI Keresés"
        onPress={handleNewSearch}
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
