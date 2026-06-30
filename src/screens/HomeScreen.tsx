import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { Text, Button, Surface, Card, MD3Colors, FAB } from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { BusinessProfile, GrantMatch, Grant, UserProfile } from '../types/database';
import { useBilling } from '../context/BillingContext';

import { AdBanner } from '../components/AdBanner';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { TesterProgress } from '../components/TesterProgress';

type MatchWithGrant = GrantMatch & { grants: Grant };
type AdItem = { type: 'ad'; id: string };
type FlatListItem = MatchWithGrant | AdItem;
const isAdItem = (item: FlatListItem): item is AdItem =>
  'type' in item && (item as AdItem).type === 'ad';

const N8N_WEBHOOK_URL = process.env.EXPO_PUBLIC_N8N_WEBHOOK_URL || 'http://10.0.2.2:5678/webhook/p-search-onboarding';

import { RootStackNavigationProp } from '../types/navigation';

export function HomeScreen({ navigation }: { navigation: RootStackNavigationProp }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [matches, setMatches] = useState<MatchWithGrant[]>([]);
  const { isPro } = useBilling();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: profileData, error: profileError } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      const { data: userData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
        
      if (userData) {
        setUserProfile(userData as UserProfile);
      }

      if (profileError && profileError.code !== 'PGRST116') {
        console.error(profileError);
      }

      if (profileData) {
        setProfile(profileData);
        // Fetch matches
        const { data: matchesData, error: matchesError } = await supabase
          .from('grant_matches')
          .select('*, grants(*)')
          .eq('business_id', profileData.id)
          .order('match_score', { ascending: false });
          
        if (matchesError) {
          console.error(matchesError);
        } else if (matchesData) {
          // Cast the result to our compound type
          setMatches(matchesData as unknown as MatchWithGrant[]);
        }
      } else {
        // No profile found, redirect to Onboarding
        navigation.replace('Onboarding');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const handleNewSearch = async () => {
    if (isPro) {
      if (profile) {
        fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: profile.id,
            user_id: userProfile?.id,
            action: 'new_search_pro'
          })
        }).catch(err => console.warn('Webhook hívás hiba:', err));
        alert("Új Pro AI keresés elindítva!");
      }
      navigation.navigate('CopilotChat');
      return;
    }

    const currentCount = userProfile?.search_count || 0;
    if (currentCount >= 1) { // 1 free search limit
      navigation.navigate('Paywall');
    } else {
      // Trigger free search and increment count
      const newCount = currentCount + 1;
      if (userProfile) setUserProfile({ ...userProfile, search_count: newCount });
      
      await supabase
        .from('profiles')
        .update({ search_count: newCount })
        .eq('id', userProfile?.id);
        
      if (profile) {
        fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: profile.id,
            user_id: userProfile?.id,
            action: 'new_search_free'
          })
        }).catch(err => console.warn('Webhook hívás hiba:', err));
      }
      alert("Ingyenes AI keresés elindítva!");
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
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

  const renderEmptyState = () => (
    <Surface style={styles.surface} elevation={2}>
      <ActivityIndicator size="large" color={MD3Colors.primary50} style={{ marginBottom: 16 }} />
      <Text variant="titleLarge" style={{ textAlign: 'center', marginBottom: 12 }}>
        Keresés folyamatban...
      </Text>
      <Text variant="bodyMedium" style={{ textAlign: 'center', marginBottom: 24, color: '#666' }}>
        Az AI rendszerünk jelenleg elemzi a megadott TEÁOR kódot ({profile?.industry_code || 'Ismeretlen'}) és célokat. Kérjük, várj türelemmel, hamarosan megjelennek a számodra releváns pályázatok!
      </Text>
      <Button mode="contained" onPress={() => fetchData()}>
        Frissítés
      </Button>
    </Surface>
  );

  const renderMatch = ({ item }: { item: MatchWithGrant }) => (
    <Card style={styles.card} mode="elevated">
      <Card.Title title={item.grants?.title || 'Ismeretlen pályázat'} subtitle={`Egyezés: ${item.match_score}%`} />
      <Card.Content>
        <Text variant="bodyMedium" style={{ marginBottom: 8, color: '#444' }}>
          {item.grants?.provider}
        </Text>
        <Text variant="bodySmall">
          {item.match_reasoning || item.grants?.description}
        </Text>
        {(item.grants?.amount_min || item.grants?.amount_max) && (
          <Text variant="labelLarge" style={{ marginTop: 8, color: '#1976D2' }}>
            Összeg: {item.grants.amount_min ? `${item.grants.amount_min.toLocaleString('hu-HU')} Ft` : '0 Ft'} - {item.grants.amount_max ? `${item.grants.amount_max.toLocaleString('hu-HU')} Ft` : '? Ft'}
          </Text>
        )}
      </Card.Content>
      <Card.Actions>
        <Button onPress={() => navigation.navigate('ActionPlan', { matchId: item.id })}>Részletek</Button>
      </Card.Actions>
    </Card>
  );

  const renderItem = ({ item }: { item: FlatListItem }) => {
    if (isAdItem(item)) {
      return (
        <View style={styles.inlineBannerContainer}>
          <BannerAd
            unitId={TestIds.BANNER}
            size={BannerAdSize.BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
            onAdFailedToLoad={(error) => console.warn('Inline banner failed to load:', error)}
          />
        </View>
      );
    }
    return renderMatch({ item });
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
          {renderEmptyState()}
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
  surface: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: 'white',
    alignItems: 'center',
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: 'white',
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
})
