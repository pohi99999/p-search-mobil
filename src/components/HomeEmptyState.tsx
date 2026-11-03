import React from 'react';
import { StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Button, Surface } from 'react-native-paper';

// Card [D] (review 2026-10-25): the empty home always showed a spinner and "Keresés folyamatban...", also when
// nothing ran and after a search that found nothing. Three states now; texts: Stratéga (szovegek-stratega.md).
export type HomeEmptyStateKind = 'searching' | 'never' | 'none';

interface HomeEmptyStateProps {
  kind: HomeEmptyStateKind;
  /** A key profile field (TEÁOR, létszám, árbevétel, cél) is empty. */
  profileIncomplete?: boolean;
  onSearch: () => void;
  onEditProfile: () => void;
}

export function HomeEmptyState({ kind, profileIncomplete = false, onSearch, onEditProfile }: HomeEmptyStateProps) {
  if (kind === 'searching') {
    return (
      <Surface style={styles.surface} elevation={2} testID="empty-searching">
        <ActivityIndicator size="large" color="#1976D2" style={styles.spinner} />
        <Text variant="titleLarge" style={styles.title}>
          Keressük a cégedhez illő pályázatokat
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          Az AI most veti össze a cégprofilodat a nyitott kiírásokkal. Ez eltarthat egy kis ideig, nyugodtan maradj ezen
          a képernyőn.
        </Text>
      </Surface>
    );
  }

  if (kind === 'never') {
    return (
      <Surface style={styles.surface} elevation={2} testID="empty-never">
        <Text variant="titleLarge" style={styles.title}>
          Még nem kerestünk a cégednek
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          Indítsd el az első keresést: az AI a cégprofilod alapján kiválasztja a nyitott pályázatok közül a hozzád
          illőket.
        </Text>
        <Button mode="contained" onPress={onSearch} testID="empty-search">
          Keresés indítása
        </Button>
        {profileIncomplete ? (
          <>
            <Text variant="bodySmall" style={styles.note}>
              Minél több adatot adsz meg a cégedről, annál pontosabb a találat.
            </Text>
            <Button mode="text" onPress={onEditProfile} testID="empty-edit-profile">
              Cégprofil kiegészítése
            </Button>
          </>
        ) : null}
      </Surface>
    );
  }

  return (
    <Surface style={styles.surface} elevation={2} testID="empty-none">
      <Text variant="titleLarge" style={styles.title}>
        Most nincs a cégedhez illő nyitott pályázat
      </Text>
      <Text variant="bodyMedium" style={styles.body}>
        Lefuttattuk a keresést, de a jelenlegi kiírások közül egyik sem illik a cégprofilodhoz. Az automatikus keresés a
        Beállításokban megadott gyakorisággal újra lefut, és ha új, hozzád illő kiírás jön, itt látod.
      </Text>
      <Button mode="contained" onPress={onEditProfile} testID="empty-edit-profile">
        Cégprofil kiegészítése
      </Button>
      <Button mode="text" onPress={onSearch} style={styles.secondary} testID="empty-search">
        Keresés újra
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
  spinner: {
    marginBottom: 16,
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
  note: {
    textAlign: 'center',
    marginTop: 16,
    color: '#616161',
  },
  secondary: {
    marginTop: 8,
  },
});
