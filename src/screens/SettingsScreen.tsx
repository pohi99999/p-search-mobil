import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  IconButton,
  List,
  RadioButton,
  Snackbar,
  Surface,
  Text,
} from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/error';
import type { SettingsScreenProps } from '../types/navigation';

type SearchFrequency = 'daily' | 'weekly' | 'manual';

type ProfileSchedule = {
  search_frequency: SearchFrequency | null;
  last_scan_at: string | null;
  next_scan_at: string | null;
};

const frequencyOptions: {
  value: SearchFrequency;
  label: string;
  description: string;
}[] = [
  {
    value: 'daily',
    label: 'Naponta',
    description: 'Minden nap új pályázatokat keresünk a cégedhez.',
  },
  {
    value: 'weekly',
    label: 'Hetente',
    description: 'Hetente egyszer frissítjük a személyre szabott találatokat.',
  },
  {
    value: 'manual',
    label: 'Csak kézzel indítom',
    description: 'Automatikus keresés helyett te indítod el az AI keresést.',
  },
];

const isSearchFrequency = (value: string | null): value is SearchFrequency =>
  value === 'daily' || value === 'weekly' || value === 'manual';

const formatScheduleDate = (value: string | null, fallback: string) => {
  if (!value) return fallback;
  return new Date(value).toLocaleString('hu-HU');
};

const computeNextScanAt = (frequency: SearchFrequency) => {
  if (frequency === 'manual') return null;

  const now = new Date();
  const daysToAdd = frequency === 'daily' ? 1 : 7;
  now.setDate(now.getDate() + daysToAdd);
  return now.toISOString();
};

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedFrequency, setSelectedFrequency] = useState<SearchFrequency>('weekly');
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [nextScanAt, setNextScanAt] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        throw new Error('Nincs aktív felhasználói munkamenet.');
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('search_frequency, last_scan_at, next_scan_at')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;

      const profileSchedule = data as ProfileSchedule | null;
      const fetchedFrequency = profileSchedule?.search_frequency ?? null;
      setSelectedFrequency(isSearchFrequency(fetchedFrequency) ? fetchedFrequency : 'weekly');
      setLastScanAt(profileSchedule?.last_scan_at ?? null);
      setNextScanAt(profileSchedule?.next_scan_at ?? null);
    } catch (err: unknown) {
      logger.error('SettingsScreen betöltési hiba:', getErrorMessage(err));
      showSnackbar('Nem sikerült betölteni a beállításokat. Kérjük, próbáld újra később.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    const computedNextScanAt = computeNextScanAt(selectedFrequency);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        throw new Error('Nincs aktív felhasználói munkamenet.');
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          search_frequency: selectedFrequency,
          next_scan_at: computedNextScanAt,
        })
        .eq('id', session.user.id);

      if (error) throw error;

      setNextScanAt(computedNextScanAt);
      showSnackbar('Keresési ütemezés sikeresen mentve.');
    } catch (err: unknown) {
      logger.error('SettingsScreen mentési hiba:', getErrorMessage(err));
      showSnackbar('Nem sikerült menteni a beállításokat. Kérjük, próbáld újra később.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={styles.loadingText}>Beállítások betöltése...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
          testID="settings-back-button"
          accessibilityLabel="Vissza a főoldalra"
        />
        <Text variant="titleLarge" style={styles.headerTitle}>
          Beállítások
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card} mode="elevated">
          <Card.Title
            title="Automatikus AI keresés"
            subtitle="Állítsd be, milyen gyakran keressünk új pályázatokat."
          />
          <Card.Content>
            <RadioButton.Group
              onValueChange={(value) => {
                if (isSearchFrequency(value)) {
                  setSelectedFrequency(value);
                }
              }}
              value={selectedFrequency}
            >
              {frequencyOptions.map((option) => (
                <List.Item
                  key={option.value}
                  title={option.label}
                  description={option.description}
                  onPress={() => setSelectedFrequency(option.value)}
                  accessibilityLabel={`${option.label} keresési gyakoriság kiválasztása`}
                  left={() => (
                    <RadioButton
                      value={option.value}
                      status={selectedFrequency === option.value ? 'checked' : 'unchecked'}
                    />
                  )}
                />
              ))}
            </RadioButton.Group>
          </Card.Content>
        </Card>

        <Surface style={styles.infoSurface} elevation={1}>
          <Text variant="titleMedium" style={styles.infoTitle}>
            Keresési állapot
          </Text>
          <View style={styles.infoRow}>
            <Text variant="bodyMedium" style={styles.infoLabel}>
              Utolsó keresés
            </Text>
            <Text variant="bodyMedium" style={styles.infoValue}>
              {formatScheduleDate(lastScanAt, 'Még nem futott')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text variant="bodyMedium" style={styles.infoLabel}>
              Következő keresés
            </Text>
            <Text variant="bodyMedium" style={styles.infoValue}>
              {formatScheduleDate(nextScanAt, 'Nincs ütemezve')}
            </Text>
          </View>
        </Surface>

        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={styles.saveButton}
          accessibilityLabel="Keresési beállítások mentése"
        >
          Mentés
        </Button>
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
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
    fontWeight: 'bold',
    color: '#1A237E',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
  },
  infoSurface: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 24,
  },
  infoTitle: {
    fontWeight: 'bold',
    color: '#1A237E',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  infoLabel: {
    color: '#666666',
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontWeight: '600',
    color: '#212121',
    marginLeft: 16,
  },
  saveButton: {
    backgroundColor: '#1976D2',
  },
});
