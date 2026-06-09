import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Button, Surface } from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { BusinessProfile } from '../types/database';

export function HomeScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error(error);
      }

      if (data) {
        setProfile(data);
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
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Surface style={styles.surface} elevation={2}>
        <Text variant="headlineSmall" style={{ marginBottom: 16 }}>
          Üdvözlünk, {profile?.company_name || 'Partnerünk'}!
        </Text>
        <Text variant="bodyMedium" style={{ marginBottom: 24 }}>
          Az AI rendszerünk már dolgozik a te TEÁOR kódod ({profile?.industry_code || 'Ismeretlen'}) és céljaid alapján a legfrissebb pályázatok felkutatásán.
        </Text>
        <Button mode="contained" onPress={() => fetchProfile()} style={{ marginBottom: 12 }}>
          Frissítés
        </Button>
        <Button mode="outlined" onPress={signOut}>
          Kijelentkezés
        </Button>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  surface: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: 'white',
  },
});
