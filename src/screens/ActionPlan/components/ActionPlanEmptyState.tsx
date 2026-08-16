import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';

interface Props {
  matchId?: string;
  generating: boolean;
  onGeneratePlan: () => void;
  onNavigateHome: () => void;
}

export function ActionPlanEmptyState({ matchId, generating, onGeneratePlan, onNavigateHome }: Props) {
  return (
    <View style={styles.emptyContainer}>
      {matchId ? (
        generating ? (
          <>
            <ActivityIndicator size="large" color="#1A237E" style={styles.spinner} />
            <Text variant="titleMedium" style={styles.title}>
              Akcióterv generálása folyamatban...
            </Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              A Gemini AI elemzi a pályázatot és a cégprofilodat. Ez eltarthat egy kis ideig.
            </Text>
          </>
        ) : (
          <>
            <Text variant="titleMedium" style={styles.title}>
              Ehhez a pályázathoz még nincs akcióterv
            </Text>
            <Text variant="bodyMedium" style={styles.subtitleWithMargin}>
              Kattints az alábbi gombra, hogy a Gemini AI elkészítse számodra a személyre szabott felkészülési tervet!
            </Text>
            <Button
              mode="contained"
              style={styles.primaryButton}
              onPress={onGeneratePlan}
            >
              Akcióterv Generálása
            </Button>
          </>
        )
      ) : (
        <>
          <Text variant="titleMedium" style={styles.title}>
            Nincs aktív akcióterved
          </Text>
          <Text variant="bodyMedium" style={styles.subtitleWithMargin}>
            Jelölj meg egy számodra érdekes pályázatot a főképernyőn, hogy elkészíthessük hozzá a felkészülési tervet!
          </Text>
          <Button mode="contained" style={styles.primaryButton} onPress={onNavigateHome}>
            Pályázatok keresése
          </Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  spinner: {
    marginBottom: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: 'bold',
  },
  subtitle: {
    textAlign: 'center',
    color: '#666',
  },
  subtitleWithMargin: {
    textAlign: 'center',
    color: '#666',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#1A237E',
    borderRadius: 8,
    paddingHorizontal: 8,
  }
});
