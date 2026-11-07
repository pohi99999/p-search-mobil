import React from 'react';
import { StyleSheet } from 'react-native';
import { Text, Button, Surface } from 'react-native-paper';

// Round 4 P1-1, P1-2: a failed read on the home is its own state. It used to look like an empty company profile or
// like "no grant fits you", and the only button there started a new AI search.
export type HomeLoadErrorKind = 'profile' | 'matches';

const TITLES: Record<HomeLoadErrorKind, string> = {
  profile: 'Nem sikerült betölteni a cégprofilodat',
  matches: 'Nem sikerült betölteni a találataidat',
};

interface HomeLoadErrorProps {
  kind: HomeLoadErrorKind;
  onRetry: () => void;
}

export function HomeLoadError({ kind, onRetry }: HomeLoadErrorProps) {
  return (
    <Surface style={styles.surface} elevation={2} testID={`load-error-${kind}`} accessibilityRole="alert">
      <Text variant="titleLarge" style={styles.title}>
        {TITLES[kind]}
      </Text>
      <Text variant="bodyMedium" style={styles.body}>
        Ellenőrizd az internetkapcsolatot, és próbáld újra.
      </Text>
      <Button mode="contained" onPress={onRetry} testID="load-error-retry">
        Újra
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
  title: {
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    textAlign: 'center',
    marginBottom: 24,
    color: '#616161',
  },
});
