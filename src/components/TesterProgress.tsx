import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Surface, Text, ProgressBar } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@beta_testing_days';
const REQUIRED_DAYS = 14;

export const TesterProgress: React.FC = () => {
  const [activeDays, setActiveDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const trackActivity = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        let daysList: string[] = stored ? JSON.parse(stored) : [];

        // Ma dátuma YYYY-MM-DD formátumban
        const today = new Date().toISOString().split('T')[0];

        // Ha a mai nap még nem szerepel a listában, hozzáadjuk
        if (!daysList.includes(today)) {
          daysList.push(today);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(daysList));
        }

        setActiveDays(daysList);
      } catch (err) {
        console.warn('Error tracking beta testing progress:', err);
        // Biztonsági másolat (Mock) ha az AsyncStorage nem lenne elérhető
        setActiveDays(['2026-06-13', '2026-06-14', '2026-06-15']);
      } finally {
        setLoading(false);
      }
    };

    trackActivity();
  }, []);

  if (loading) {
    return null;
  }

  const daysCount = Math.min(activeDays.length, REQUIRED_DAYS);
  const progress = daysCount / REQUIRED_DAYS;
  const isCompleted = daysCount >= REQUIRED_DAYS;

  return (
    <Surface style={styles.container} elevation={1}>
      <View style={styles.headerRow}>
        <Text variant="labelMedium" style={styles.badge}>
          🧪 Béta Tesztelői Zóna
        </Text>
        <Text variant="bodySmall" style={styles.daysText}>
          {daysCount}/{REQUIRED_DAYS} nap aktív
        </Text>
      </View>

      <ProgressBar 
        progress={progress} 
        color={isCompleted ? '#4CAF50' : '#1976D2'} 
        style={styles.progressBar} 
      />

      <Text variant="bodySmall" style={styles.description}>
        {isCompleted 
          ? 'Köszönjük! Teljesítetted a 14 napos kötelező tesztelési fázist. 🎉' 
          : `Segíts publikálni az appot! Lépj be mindennap. Hátralévő napok száma: ${REQUIRED_DAYS - daysCount} nap.`}
      </Text>
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E8EAF6',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    fontWeight: 'bold',
    color: '#1A237E',
  },
  daysText: {
    fontWeight: 'bold',
    color: '#5C6BC0',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8EAF6',
    marginBottom: 6,
  },
  description: {
    fontSize: 11,
    color: '#757575',
  },
});
