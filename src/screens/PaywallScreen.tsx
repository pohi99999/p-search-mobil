import { RootStackNavigationProp } from "../types/navigation";
import React, { useEffect, useState } from 'react';
import { PurchasesPackage } from 'react-native-purchases';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, Button, ActivityIndicator, IconButton, Snackbar, Icon } from 'react-native-paper';
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
  PaywallSuccess,
  PaywallActivePro
} from '../components/paywall';
import { notify } from '../lib/notify';
import { formatDeadline } from '../lib/deadline';

export const PaywallScreen = () => {
  const { packages, purchasePackage, restorePurchases, isLoading, isPro } = useBilling();
  // Edge-to-edge: keep the footer above the Android navigation bar (owner test 2026-10-04).
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RootStackNavigationProp>();
  const route = useRoute<RouteProp<RootStackParamList, 'Paywall'>>();
  const [purchasing, setPurchasing] = useState(false);
  // Round 2 (Lumen P1-1): the success screen is for a purchase made right now, not for every later opening.
  const [justPurchased, setJustPurchased] = useState(false);
  // [G2]: one paywall_view per opening, with where it came from (a Pro user sees the success view, not the offer).
  const source = route.params?.source;
  // vc23 (Lumen L7): opened from a grant, the offer names it and its deadline (an unknown deadline is left out).
  const grantTitle = route.params?.grantTitle?.trim() || null;
  const deadlineInfo = formatDeadline(route.params?.deadline);
  // The match card's own wording ("Beadás: 2026. 12. 11. (még 20 nap)"), so the date never stands without a label.
  const deadlineLine = deadlineInfo.tone === 'soon' || deadlineInfo.tone === 'normal' ? deadlineInfo.label : null;
  useEffect(() => {
    // A route without a source is 'other', never guessed as one of the known places.
    if (!isPro) track('paywall_view', { source: source ?? 'other' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recorded once per opening, not on every isPro change
  }, []);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // P-Search kör 2 (Kenshin P1-2): purchase_done only for a purchase that went through; a cancel shows nothing,
  // a failure or an unavailable store says so.
  const handlePurchase = async (pkg: PurchasesPackage) => {
    setPurchasing(true);
    try {
      const result = await purchasePackage(pkg);
      if (result === 'purchased') {
        setJustPurchased(true);
        // The RevenueCat package id ($rc_monthly...), never the price.
        track('purchase_done', { package: pkg.identifier });
      } else if (result === 'failed') {
        notify('Hiba', 'Vásárlási hiba történt. Kérjük, próbáld újra később.');
      } else if (result === 'unavailable') {
        notify('Hiba', 'A vásárlás most nem érhető el. Kérjük, próbáld újra később.');
      }
    } catch (err: unknown) {
      logger.error('Vásárlási hiba:', getErrorMessage(err));
      notify('Hiba', 'Vásárlási hiba történt. Kérjük, próbáld újra később.');
    } finally {
      setPurchasing(false);
    }
  };

  // Kenshin P1-3: "Siker" only when a Pro subscription was found; none found and an error each say so.
  const handleRestore = async () => {
    setPurchasing(true);
    try {
      const { isPro: restored } = await restorePurchases();
      if (restored) notify('Siker', 'Előfizetés visszaállítva.');
      else notify('Nincs előfizetés', 'Nem találtunk aktív előfizetést ehhez a fiókhoz.');
    } catch (err: unknown) {
      logger.error('Visszaállítási hiba:', getErrorMessage(err));
      notify('Hiba', 'Visszaállítási hiba történt. Kérjük, próbáld újra később.');
    } finally {
      setPurchasing(false);
    }
  };

  // A purchase made on this screen gets the success screen; an existing Pro subscriber gets the manage view.
  if (isPro) {
    if (justPurchased) return <PaywallSuccess onBack={() => navigation.goBack()} />;
    return <PaywallActivePro onClose={() => navigation.goBack()} onRestore={handleRestore} busy={purchasing} />;
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

        <Text role="heading" aria-level={1} variant="displaySmall" style={styles.title}>
          P-Search PRO
        </Text>

        <Text variant="bodyLarge" style={styles.subtitle}>
          {/* Péter, Telegram 17610: "fel is készülsz a beadásra", because the app does not submit anything itself. */}
          Ingyen megtalálod a cégedhez illő kiírást. A Pro-val nem maradsz le róla, és fel is készülsz a beadásra.
        </Text>

        {grantTitle ? (
          <View style={styles.contextBox} testID="paywall-grant-context">
            <Icon source="calendar-clock" size={22} color="#1A237E" />
            <View style={styles.contextText}>
              <Text variant="labelMedium" style={styles.contextLabel}>Ehhez a kiíráshoz készülsz:</Text>
              <Text variant="bodyMedium" style={styles.contextTitle} numberOfLines={3}>{grantTitle}</Text>
              {deadlineLine ? (
                <Text variant="bodyMedium" style={styles.contextDeadline} testID="paywall-grant-deadline">{deadlineLine}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <PaywallFeatures />

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
  // On #E8EAF6: #1A237E 11.06:1, #3949AB 6.46:1, the deadline's #8A4F00 5.48:1 (the card's #A15C00 would be 4.33).
  contextBox: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: '#E8EAF6',
  },
  contextText: {
    flex: 1,
  },
  contextLabel: {
    color: '#3949AB',
    marginBottom: 2,
  },
  contextTitle: {
    color: '#1A237E',
    fontWeight: 'bold',
  },
  contextDeadline: {
    color: '#8A4F00',
    fontWeight: 'bold',
    marginTop: 4,
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
