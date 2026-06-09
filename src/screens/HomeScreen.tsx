import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { Text, Button, Surface, Card, MD3Colors } from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { BusinessProfile, GrantMatch, Grant } from '../types/database';

type MatchWithGrant = GrantMatch & { grants: Grant };

export function HomeScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [matches, setMatches] = useState<MatchWithGrant[]>([]);

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
          setMatches(matchesData as any);
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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={{ marginTop: 16 }}>Adataid betöltése...</Text>
      </View>
    );
  }

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
        <Button>Részletek</Button>
      </Card.Actions>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="titleMedium" style={{ flex: 1 }}>
          Üdv, {profile?.company_name || 'Partnerünk'}!
        </Text>
        <Button mode="text" onPress={signOut} compact>
          Kijelentkezés
        </Button>
      </View>
      
      {matches.length === 0 ? (
        <View style={styles.emptyContainer}>
          {renderEmptyState()}
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.id}
          renderItem={renderMatch}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshing={loading}
          onRefresh={fetchData}
        />
      )}
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
});
