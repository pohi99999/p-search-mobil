import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { TextInput, Button, Text, Surface, HelperText } from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { AdBanner } from '../components/AdBanner';

import { RootStackNavigationProp } from '../types/navigation';
import { N8N_WEBHOOK_URL } from '../config/constants';

export function OnboardingScreen({ navigation }: { navigation: RootStackNavigationProp }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    company_name: '',
    tax_number: '',
    industry_code: '',
    employee_count: '',
    yearly_revenue: '',
    goals: '',
  });


  const handleSave = async () => {
    if (!form.company_name) {
      setError('A cégnév megadása kötelező!');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Nincs bejelentkezett felhasználó!');

      const { data: newProfile, error: dbError } = await supabase
        .from('business_profiles')
        .insert([
          {
            user_id: session.user.id,
            company_name: form.company_name,
            tax_number: form.tax_number,
            industry_code: form.industry_code,
            employee_count: form.employee_count ? parseInt(form.employee_count) : null,
            yearly_revenue: form.yearly_revenue ? parseInt(form.yearly_revenue) : null,
            goals: form.goals,
          }
        ])
        .select()
        .single();

      if (dbError) throw dbError;

      // Keresés indítása n8n webhookon keresztül (Fire and forget, nem várjuk meg)
      if (newProfile) {
        fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: newProfile.id,
            user_id: session.user.id,
            action: 'new_profile_created'
          })
        }).catch(err => console.warn('Webhook hívás hiba:', err));
      }

      // Siker esetén navigálás a Home oldalra
      navigation.replace('Home');
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : String(e)) || 'Hiba történt a mentés során.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <ScrollView style={styles.container}>
        <Surface style={styles.surface} elevation={2}>
          <Text variant="headlineMedium" style={styles.title}>Cégprofil Létrehozása</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Kérjük, add meg a cég alapvető adatait, hogy az AI megkereshesse számodra a leginkább megfelelő pályázatokat!
          </Text>

          {error && <HelperText type="error" visible={true}>{error}</HelperText>}

          <TextInput
            label="Cégnév *"
            value={form.company_name}
            onChangeText={(text) => setForm({ ...form, company_name: text })}
            style={styles.input}
            mode="outlined"
          />

          <TextInput
            label="Adószám"
            value={form.tax_number}
            onChangeText={(text) => setForm({ ...form, tax_number: text })}
            style={styles.input}
            mode="outlined"
          />

          <TextInput
            label="Főtevékenység (TEÁOR)"
            value={form.industry_code}
            onChangeText={(text) => setForm({ ...form, industry_code: text })}
            style={styles.input}
            mode="outlined"
          />

          <TextInput
            label="Alkalmazottak száma"
            value={form.employee_count}
            onChangeText={(text) => setForm({ ...form, employee_count: text })}
            style={styles.input}
            keyboardType="numeric"
            mode="outlined"
          />

          <TextInput
            label="Éves árbevétel (HUF)"
            value={form.yearly_revenue}
            onChangeText={(text) => setForm({ ...form, yearly_revenue: text })}
            style={styles.input}
            keyboardType="numeric"
            mode="outlined"
          />

          <TextInput
            label="Fejlesztési célok (pl. gépbeszerzés, zöldítés)"
            value={form.goals}
            onChangeText={(text) => setForm({ ...form, goals: text })}
            style={styles.input}
            multiline
            numberOfLines={3}
            mode="outlined"
          />

          <Button 
            mode="contained" 
            onPress={handleSave} 
            loading={loading}
            disabled={loading}
            style={styles.button}
          >
            Mentés és Keresés Indítása
          </Button>
        </Surface>
      </ScrollView>
      <AdBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  surface: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: 'white',
    marginBottom: 40,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: 'bold',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: '#666',
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
    paddingVertical: 6,
  },
});
