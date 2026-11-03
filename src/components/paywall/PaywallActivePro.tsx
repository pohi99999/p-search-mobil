import React from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { Text, Button, IconButton } from 'react-native-paper';
import { logger } from '../../utils/logger';

// Round 2 (Lumen P1-1): a Pro subscriber opening "Csomagok és visszaállítás" from Settings got the
// "Sikeres Pro előfizetés! 🎉" screen every time, with no way to manage or restore the subscription.
// This is what a Pro user sees now; the success screen is only shown right after a purchase.

/** The Play Store's own subscription page for this app, where the user cancels or changes payment. */
export const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions?package=com.pohankaestarsa.psearch';

interface PaywallActiveProProps {
  onClose: () => void;
  onRestore: () => void;
  busy: boolean;
}

export const PaywallActivePro = ({ onClose, onRestore, busy }: PaywallActiveProProps) => {
  const openPlay = () => {
    Linking.openURL(PLAY_SUBSCRIPTIONS_URL).catch((err) => logger.error('A Play előfizetés-kezelő nem nyílt meg:', err));
  };

  return (
    <View style={styles.container} testID="paywall-active-pro">
      <View style={styles.headerRow}>
        <IconButton icon="close" size={24} onPress={onClose} accessibilityLabel="Bezárás" testID="active-pro-close" />
      </View>
      <Text variant="headlineSmall" style={styles.title} accessibilityRole="header">
        Aktív Pro előfizetés
      </Text>
      <Text variant="bodyLarge" style={styles.body}>
        A Pro funkciók elérhetők: akcióterv, dokumentum-vázlat PDF-ben, hirdetések nélkül.
      </Text>
      <Button
        mode="contained"
        icon="open-in-new"
        onPress={openPlay}
        style={styles.button}
        testID="active-pro-manage"
      >
        Előfizetés kezelése a Google Playen
      </Button>
      <Text variant="bodySmall" style={styles.note}>
        A lemondás és a fizetési mód a Google Play-fiókodban módosítható.
      </Text>
      <Button mode="text" onPress={onRestore} disabled={busy} style={styles.button} textColor="#1565C0" testID="active-pro-restore">
        Vásárlás visszaállítása
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#FAFBFD',
  },
  headerRow: {
    alignItems: 'flex-end',
  },
  title: {
    fontWeight: 'bold',
    color: '#1A237E',
    marginTop: 8,
    marginBottom: 12,
  },
  body: {
    color: '#424242',
    lineHeight: 24,
    marginBottom: 24,
  },
  button: {
    marginTop: 8,
  },
  note: {
    color: '#616161',
    marginTop: 8,
    marginBottom: 16,
  },
});
