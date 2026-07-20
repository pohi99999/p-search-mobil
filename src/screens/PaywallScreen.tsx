import { RootStackNavigationProp } from "../types/navigation";

import React, { useState } from 'react';
import { PurchasesPackage } from 'react-native-purchases';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, Button, Card, useTheme, ActivityIndicator, IconButton, List, Banner, Snackbar } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { useNavigation } from '@react-navigation/native';
import { logger } from '../utils/logger';

export const PaywallScreen = () => {
  const { packages, purchasePackage, restorePurchases, isLoading, isPro } = useBilling();
  const theme = useTheme();
  const navigation = useNavigation<RootStackNavigationProp>();
  const [purchasing, setPurchasing] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handlePurchase = async (pkg: PurchasesPackage) => {
    setPurchasing(true);
    try {
      await purchasePackage(pkg);
    } catch (err: unknown) {
      logger.error('Purchase error:', err);
      alert('Vásárlási hiba: Kérjük, próbáld újra később.');
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
      logger.error('Restore error:', err);
      alert('Visszaállítási hiba: Kérjük, próbáld újra később.');
    } finally {
      setPurchasing(false);
    }
  };

  // Ha a felhasználó már Pro előfizető, sikeres állapotot mutatunk neki
  if (isPro) {
    return (
      <View style={styles.centered}>
        <IconButton icon="star-circle" iconColor="#FFD700" size={80} style={styles.proIcon} />
        <Text variant="headlineMedium" style={styles.successTitle}>
          Sikeres Pro Előfizetés! 🎉
        </Text>
        <Text variant="bodyLarge" style={styles.successSubtitle}>
          Köszönjük a bizalmat! Mostantól korlátlan hozzáférésed van az összes prémium funkcióhoz reklámok nélkül.
        </Text>
        <Button mode="contained" onPress={() => navigation.goBack()} style={styles.backButtonPro}>
          Vissza a Kezdőlapra
        </Button>
      </View>
    );
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

      {/* Pro előnyök kártyája */}
      <Card style={styles.featureCard} mode="outlined">
        <Card.Content>
          <List.Item
            title="✍️ Korlátlan AI Pályázatíró & Hitelügyintéző"
            titleStyle={styles.featureTitle}
            titleNumberOfLines={2}
            description="Gemini AI megírja az igénylési dokumentumokat, elemzi a pályázatokat és felkészít a hitelügyintézésre."
            descriptionStyle={styles.featureDesc}
            descriptionNumberOfLines={3}
          />
          <List.Item
            title="📂 Automatikus Master Dokumentum Bázis (OCR)"
            titleStyle={styles.featureTitle}
            titleNumberOfLines={2}
            description="Töltsd fel pénzügyi kimutatásaidat — az AI OCR-rel automatikusan feldolgozza és strukturálja az adatokat."
            descriptionStyle={styles.featureDesc}
            descriptionNumberOfLines={3}
          />
          <List.Item
            title="📄 Teljes PDF & DOCX Export"
            titleStyle={styles.featureTitle}
            titleNumberOfLines={2}
            description="Professzionálisan előkitöltött pályázati dokumentumok egy kattintással, letölthetőn és megoszthatóan."
            descriptionStyle={styles.featureDesc}
            descriptionNumberOfLines={3}
          />
          <List.Item
            title="🚫 Hirdetésmentesség"
            titleStyle={styles.featureTitle}
            description="Tiszta, zavaró tényezőktől mentes kezelőfelület a gyorsabb munkához."
            descriptionStyle={styles.featureDesc}
          />
        </Card.Content>
      </Card>

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
        <View style={styles.packagesContainer}>
          {packages.length === 0 ? (
            // Fallback mock package ha a RevenueCat sandbox még nem szinkronizált
            <Card style={styles.packageCard} mode="elevated">
              <Card.Content style={styles.packageContent}>
                <Text variant="labelMedium" style={styles.popularBadge}>⭐ LEGNÉPSZERŰBB</Text>
                <Text variant="titleLarge" style={styles.packageName}>Pro Havi Tagság</Text>
                <Text variant="bodyMedium" style={styles.packageDesc}>Minden prémium funkció elérése</Text>
                <Text variant="headlineMedium" style={styles.packagePrice}>
                  1 990 Ft <Text variant="bodySmall" style={styles.pricePeriod}>/ hó</Text>
                </Text>
                <Text variant="bodySmall" style={styles.trialNote}>7 napos ingyenes próba</Text>
              </Card.Content>
              <Card.Actions style={styles.cardActions}>
                <Button
                  mode="contained"
                  style={styles.purchaseButton}
                  contentStyle={styles.purchaseButtonContent}
                  disabled={purchasing}
                  onPress={async () => {
                    alert('Hálózati teszt üzemmód. Valós vásárlás a Google Play Sandbox segítségével történik.');
                  }}
                >
                  Előfizetés indítása
                </Button>
              </Card.Actions>
            </Card>
          ) : (
            packages.map((pkg) => (
              <Card key={pkg.identifier} style={styles.packageCard} mode="elevated">
                <Card.Content style={styles.packageContent}>
                  <Text variant="labelMedium" style={styles.popularBadge}>⭐ LEGNÉPSZERŰBB</Text>
                  <Text variant="titleLarge" style={styles.packageName}>
                    {pkg.product.title || 'P-Search Pro előfizetés'}
                  </Text>
                  <Text variant="bodyMedium" style={styles.packageDesc}>
                    {pkg.product.description || 'Hozzáférés az összes Pro funkcióhoz'}
                  </Text>
                  <Text variant="headlineMedium" style={styles.packagePrice}>
                    {pkg.product.priceString}
                  </Text>
                </Card.Content>
                <Card.Actions style={styles.cardActions}>
                  <Button
                    mode="contained"
                    style={styles.purchaseButton}
                    contentStyle={styles.purchaseButtonContent}
                    disabled={purchasing}
                    onPress={() => handlePurchase(pkg)}
                  >
                    Előfizetés indítása
                  </Button>
                </Card.Actions>
              </Card>
            ))
          )}
        </View>
      )}

      {/* Műveletek gomb */}
      <Button mode="text" onPress={handleRestore} style={styles.restoreButton} labelStyle={styles.restoreButtonLabel} disabled={purchasing}>
        Korábbi vásárlások visszaállítása
      </Button>

      <Text variant="bodySmall" style={styles.disclaimer}>
        Az előfizetés automatikusan megújul, de bármikor lemondható a Google Play Áruház fiók beállításaiban.
      </Text>
    </ScrollView>

    {/* Full-screen checkout overlay */}
    {purchasing && (
      <View style={styles.purchasingOverlay}>
        <View style={styles.overlayCard}>
          <ActivityIndicator size="large" color="#1A237E" style={{ marginBottom: 16 }} />
          <Text variant="titleMedium" style={styles.overlayTitle}>Feldolgozás...</Text>
          <Text variant="bodyMedium" style={styles.overlaySubtitle}>
            Kérjük, ne zárd be az appot.
          </Text>
        </View>
      </View>
    )}

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
  featureCard: {
    width: '100%',
    marginBottom: 24,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderColor: '#E3F2FD',
    borderWidth: 1.5,
    elevation: 0,
  },
  featureTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#1565C0',
  },
  featureDesc: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  loader: {
    marginVertical: 30,
  },
  packagesContainer: {
    width: '100%',
    alignItems: 'center',
  },
  packageCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: '#E8EAF6',
    marginBottom: 16,
    overflow: 'hidden',
  },
  packageContent: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  packageName: {
    fontWeight: 'bold',
    color: '#1A237E',
    marginBottom: 4,
  },
  packageDesc: {
    color: '#757575',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  packagePrice: {
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  cardActions: {
    justifyContent: 'center',
    paddingBottom: 16,
  },
  purchaseButton: {
    width: '90%',
    borderRadius: 12,
    backgroundColor: '#1A237E',
  },
  purchaseButtonContent: {
    paddingVertical: 6,
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FAFBFD',
  },
  proIcon: {
    marginBottom: 16,
  },
  successTitle: {
    fontWeight: 'bold',
    color: '#2E7D32',
    textAlign: 'center',
    marginBottom: 12,
  },
  successSubtitle: {
    textAlign: 'center',
    color: '#555',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  backButtonPro: {
    borderRadius: 12,
    paddingHorizontal: 24,
    backgroundColor: '#2E7D32',
  },
  purchasingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  overlayCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '72%',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  overlayTitle: {
    color: '#1A237E',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  overlaySubtitle: {
    color: '#666',
    textAlign: 'center',
  },
  popularBadge: {
    color: '#FF6F00',
    fontWeight: 'bold',
    marginBottom: 4,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  trialNote: {
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 4,
    fontSize: 12,
  },
  pricePeriod: {
    color: '#757575',
    fontSize: 14,
  },
});