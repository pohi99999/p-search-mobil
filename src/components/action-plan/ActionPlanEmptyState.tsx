import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { BusinessProfile } from '../../types/database';
import { logger } from '../../utils/logger';

interface ActionPlanEmptyStateProps {
  matchId?: string;
  generating: boolean;
  profile: BusinessProfile | null;
  onGenerate: (profileId: string, matchId: string) => Promise<void>;
  onNavigateHome: () => void;
  setGenerating: (generating: boolean) => void;
  setSnackbarMessage: (message: string) => void;
  setSnackbarVisible: (visible: boolean) => void;
}

export function ActionPlanEmptyState({
  matchId,
  generating,
  profile,
  onGenerate,
  onNavigateHome,
  setGenerating,
  setSnackbarMessage,
  setSnackbarVisible,
}: ActionPlanEmptyStateProps) {
  return (
    <View style={styles.emptyContainer}>
      {matchId ? (
        generating ? (
          <>
            <ActivityIndicator size="large" color="#1A237E" style={{ marginBottom: 16 }} />
            <Text
              variant="titleMedium"
              style={{ textAlign: 'center', marginBottom: 8, fontWeight: 'bold' }}
            >
              Akcióterv generálása folyamatban...
            </Text>
            <Text variant="bodyMedium" style={{ textAlign: 'center', color: '#666' }}>
              A Gemini AI elemzi a pályázatot és a cégprofilodat. Ez eltarthat egy kis ideig.
            </Text>
          </>
        ) : (
          <>
            <Text
              variant="titleMedium"
              style={{ textAlign: 'center', marginBottom: 8, fontWeight: 'bold' }}
            >
              Ehhez a pályázathoz még nincs akcióterv
            </Text>
            <Text
              variant="bodyMedium"
              style={{ textAlign: 'center', color: '#666', marginBottom: 24 }}
            >
              Kattints az alábbi gombra, hogy a Gemini AI elkészítse számodra a személyre szabott
              felkészülési tervet!
            </Text>
            <Button
              mode="contained"
              style={styles.primaryButton}
              onPress={async () => {
                if (!profile || !matchId) return;
                setGenerating(true);
                try {
                  await onGenerate(profile.id, matchId);
                  setSnackbarMessage('Akcióterv sikeresen legenerálva!');
                  setSnackbarVisible(true);
                } catch (err: unknown) {
                  logger.error('Hiba az akcióterv generálása során:', err);
                  setSnackbarMessage(
                    'Hiba történt a generálás során. Kérjük, próbálja újra később.',
                  );
                  setSnackbarVisible(true);
                } finally {
                  setGenerating(false);
                }
              }}
            >
              Akcióterv Generálása
            </Button>
          </>
        )
      ) : (
        <>
          <Text
            variant="titleMedium"
            style={{ textAlign: 'center', marginBottom: 8, fontWeight: 'bold' }}
          >
            Nincs aktív akcióterved
          </Text>
          <Text
            variant="bodyMedium"
            style={{ textAlign: 'center', color: '#666', marginBottom: 24 }}
          >
            Jelölj meg egy számodra érdekes pályázatot a főképernyőn, hogy elkészíthessük hozzá a
            felkészülési tervet!
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
  primaryButton: {
    backgroundColor: '#1A237E',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
});
