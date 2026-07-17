import React from 'react';
import { StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Button, Surface, MD3Colors } from 'react-native-paper';

interface HomeEmptyStateProps {
  industryCode?: string | null;
  onRefresh: () => void;
}

export function HomeEmptyState({ industryCode, onRefresh }: HomeEmptyStateProps) {
  return (
    <Surface style={styles.surface} elevation={2}>
      <ActivityIndicator size="large" color={MD3Colors.primary50} style={{ marginBottom: 16 }} />
      <Text variant="titleLarge" style={{ textAlign: 'center', marginBottom: 12 }}>
        Keresés folyamatban...
      </Text>
      <Text variant="bodyMedium" style={{ textAlign: 'center', marginBottom: 24, color: '#666' }}>
        Az AI rendszerünk jelenleg elemzi a megadott TEÁOR kódot ({industryCode || 'Ismeretlen'}) és célokat. Kérjük, várj türelemmel, hamarosan megjelennek a számodra releváns pályázatok!
      </Text>
      <Button mode="contained" onPress={onRefresh}>
        Frissítés
      </Button>
    </Surface>
  );
}

const styles = StyleSheet.create({
  surface: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: 'white',
    alignItems: 'center',
  },
});
