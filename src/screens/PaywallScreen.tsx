import { RootStackNavigationProp } from "../types/navigation";
import React, { useEffect, useState } from 'react';
import { PurchasesPackage } from 'react-native-purchases';
import { View, StyleSheet, ScrollView, Platform, Alert } from 'react-native';
import { Text, Button, ActivityIndicator, IconButton, Banner, Snackbar } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { track } from '../services/events';
import { getErrorMessage } from '../utils/error';
import { logger } from '../utils/logger';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PaywallFeatures,
  PaywallPackages,
  PaywallOverlay,
  PaywallSuccess
} from '../components/paywall';

export const PaywallScreen = () => {
  const { packages, purchasePackage, restorePurchases, isLoading, isPro } = useBilling();
  // Edge-to-edge: keep the footer above the Android navigation bar (owner test 2026-10-04).
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RootStackNavigationProp>();
  const route = useRoute<RouteProp<RootStackParamList, 'Paywall'>>();
  const [purchasing, setPurchasing] = useState(false);
  // [G2]: one paywall_view per opening, with where it came from (a Pro user sees the success view, not the offer).
  const source = route.params?.source;
  useEffect(() => {
    // A route without a source is 'other', never guessed as one of the known places.
    if (!isPro) track('paywall_view', { source: source ?? 'other' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recorded once per opening, not on every isPro change
  }, []);
  const [ocrConfidence, setOcrConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // P-Search kör 2 (Kenshin P1-2): purchase_done only for a purchase that went through; a cancel shows nothing,
  // a failure or an unavailable store says so.
  const handlePurchase = async (pkg: PurchasesPackage) => {
    setPurchasing(true);
    try {
      const result = await purchasePackage(pkg);
      if (result === 'purchased') {
        // The RevenueCat package id ($rc_monthly...), never the price.
        track('purchase_done', { package: pkg.identifier });
      } else if (result === 'failed') {
        Alert.alert('Hiba', 'Vásárlási hiba történt. Kérjük, próbáld újra később.');
      } else if (result === 'unavailable') {
        Alert.alert('Hiba', 'A vásárlás most nem érhető el. Kérjük, próbáld újra később.');
      }
    } catch (err: unknown) {
      logger.error('Vásárlási hiba:', getErrorMessage(err));
      Alert.alert('Hiba', 'Vásárlási hiba történt. Kérjük, próbáld újra később.');
    } finally {
      setPurchasing(false);
    }
  };

  // Kenshin P1-3: "Siker" only when a Pro subscription was found; none found and an error each say so.
  const handleRestore = async () => {
    setPurchasing(true);
    try {
      const { isPro: restored } = await restorePurchases();
      if (restored) Alert.alert('Siker', 'Előfizetés visszaállítva.');
      else Alert.alert('Nincs előfizetés', 'Nem találtunk aktív előfizetést ehhez a fiókhoz.');
    } catch (err: unknown) {
      logger.error('Visszaállítási hiba:', getErrorMessage(err));
      Alert.alert('Hiba', 'Visszaállítási hiba történt. Kérjük, próbáld újra később.');
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
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} testID="paywall-scroll">
        {/* Bezárás gomb */}
        <View style={styles.headerRow}>
          <IconButton
            icon="close"
            size={24}
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
            accessibilityLabel="Bezárás"
          />
        </View>

        {/* Prémium Korona ikon */}
        <IconButton icon="crown" iconColor="#FFD700" size={60} style={styles.crownIcon} />

        <Text variant="displaySmall" style={styles.title}>
          P-Search PRO
        </Text>

        <Text variant="bodyLarge" style={styles.subtitle}>
          Készülj fel a kiválasztott pályázatra: akcióterv, dokumentum-vázlat PDF-ben, hirdetések nélkül.
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
  // Card [I]: the renewal terms were #9E9E9E at 11 px, 2.59:1 on #FAFBFD; #616161 at 12 px is 5.98:1.
  disclaimer: {
    textAlign: 'center',
    color: '#616161',
    fontSize: 12,
    marginTop: 20,
    lineHeight: 16,
    paddingHorizontal: 20,
  },
});
