import { RootStackNavigationProp } from "../types/navigation";
import React, { useState } from 'react';
import { PurchasesPackage } from 'react-native-purchases';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, Button, useTheme, ActivityIndicator, IconButton, Banner, Snackbar } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { useNavigation } from '@react-navigation/native';
import { getErrorMessage } from '../utils/error';
import { logger } from '../utils/logger';

import {
  PaywallFeatures,
  PaywallPackages,
  PaywallOverlay,
  PaywallSuccess
} from '../components/paywall';

export const PaywallScreen = () => {
  const { packages, purchasePackage, restorePurchases, isLoading, isPro } = useBilling();
  const theme = useTheme();
  const navigation = useNavigation<RootStackNavigationProp>();
  const [purchasing, setPurchasing] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handlePurchase = async (pkg: PurchasesPackage) => {
    setPurchasing(true);
    try {
      await purchasePackage(pkg);
    } catch (err: unknown) {
      logger.error('Vásárlási hiba:', getErrorMessage(err));
      alert('Vásárlási hiba történt. Kérjük, próbáld újra később.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setPurchasing(true);
    try {
      await restorePurchases();
      alert('Vásárlások sikeresen ellenőrizve!');
    } catch (err: unknown) {
      logger.error('Visszaállítási hiba:', getErrorMessage(err));
      alert('Visszaállítási hiba történt. Kérjük, próbáld újra később.');
    } finally {
      setPurchasing(false);
    }
  };

  // Ha a felhasználó már Pro előfizető, sikeres állapotot mutatunk neki
  if (isPro) {
    return <PaywallSuccess onBack={() => navigation.goBack()} />;
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Bezárás gomb */}
        <View style={styles.headerRow}>
          <IconButton
            icon="close"
            size={24}
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
          />
        </View>

        {/* Prémium Korona ikon */}
        <IconButton icon="crown" iconColor="#FFD700" size={60} style={styles.crownIcon} />

        <Text variant="displaySmall" style={styles.title}>
          P-Search PRO
        </Text>

        <Text variant="bodyLarge" style={styles.subtitle}>
          Maximalizáld a pályázati sikereidet a legfejlettebb AI asszisztenssel és korlátlan lehetőségekkel.
        </Text>

        <PaywallFeatures />

        <Banner
          visible={ocrConfidence === 'low'}
          actions={[
            {
              label: 'Újra fotózom',
              onPress: () => setOcrConfidence(null),
            },
          ]}
          icon="alert"
        >
          A dokumentum minősége nem megfelelő. Kérjük, tölts fel egy tisztább, olvashatóbb mérleget vagy főkönyvet!
        </Banner>

        {isLoading && !purchasing ? (
          <ActivityIndicator size="large" color="#1A237E" style={styles.loader} />
        ) : (
          <PaywallPackages
            packages={packages}
            purchasing={purchasing}
            handlePurchase={handlePurchase}
          />
        )}

        {/* Műveletek gomb */}
        <Button
          mode="text"
          onPress={handleRestore}
          style={styles.restoreButton}
          labelStyle={styles.restoreButtonLabel}
          disabled={purchasing}
        >
          Korábbi vásárlások visszaállítása
        </Button>

        <Text variant="bodySmall" style={styles.disclaimer}>
          Az előfizetés automatikusan megújul, de bármikor lemondható a Google Play Áruház fiók beállításaiban.
        </Text>
      </ScrollView>

      <PaywallOverlay purchasing={purchasing} />

      <Snackbar
        visible={!!uploadError}
        onDismiss={() => setUploadError(null)}
        duration={3000}
      >
        {uploadError}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#FAFBFD',
  },
  container: {
    flex: 1,
    backgroundColor: '#FAFBFD',
  },
  content: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 40 : 20,
    alignItems: 'center',
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  closeButton: {
    margin: 0,
  },
  crownIcon: {
    margin: 0,
    marginBottom: 8,
  },
  title: {
    fontWeight: 'bold',
    color: '#1A237E', // Prémium mélykék szín
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: '#666',
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  loader: {
    marginVertical: 30,
  },
  restoreButton: {
    marginTop: 12,
  },
  restoreButtonLabel: {
    color: '#1565C0',
    fontSize: 13,
    fontWeight: '600',
  },
  disclaimer: {
    textAlign: 'center',
    color: '#9E9E9E',
    fontSize: 11,
    marginTop: 20,
    lineHeight: 16,
    paddingHorizontal: 20,
  },
});
