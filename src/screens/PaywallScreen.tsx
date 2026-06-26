import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types/navigation";
import React from 'react';
import { PurchasesPackage } from 'react-native-purchases';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, Button, Card, useTheme, ActivityIndicator, IconButton, List } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { useNavigation } from '@react-navigation/native';

export const PaywallScreen = () => {
  const { packages, purchasePackage, restorePurchases, isLoading, isPro } = useBilling();
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handlePurchase = async (pkg: PurchasesPackage) => {
    try {
      await purchasePackage(pkg);
    } catch (err: unknown) {
      alert('Vásárlási hiba: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRestore = async () => {
    try {
      await restorePurchases();
      alert('Vásárlások sikeresen ellenőrizve!');
    } catch (err: unknown) {
      alert('Visszaállítási hiba: ' + (err instanceof Error ? err.message : String(err)));
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
            title="🚫 Hirdetésmentesség"
            titleStyle={styles.featureTitle}
            description="Tiszta, zavaró tényezőktől mentes kezelőfelület a gyorsabb munkához."
            descriptionStyle={styles.featureDesc}
          />
          <List.Item
            title="🧠 Mélyreható AI elemzés"
            titleStyle={styles.featureTitle}
            description="A Gemini legújabb modellje részletesen elemzi a pályázatokat és a cégedet."
            descriptionStyle={styles.featureDesc}
          />
          <List.Item
            title="📄 Korlátlan és azonnali PDF generálás"
            titleStyle={styles.featureTitle}
            description="Egyetlen kattintással töltsd le vagy oszd meg a kész akcióterveket és üzleti terveket."
            descriptionStyle={styles.featureDesc}
          />
        </Card.Content>
      </Card>

      {isLoading ? (
        <ActivityIndicator size="large" color="#1A237E" style={styles.loader} />
      ) : (
        <View style={styles.packagesContainer}>
          {packages.length === 0 ? (
            // Fallback mock package ha a RevenueCat sandbox még nem szinkronizált
            <Card style={styles.packageCard} mode="elevated">
              <Card.Content style={styles.packageContent}>
                <Text variant="titleLarge" style={styles.packageName}>Pro Havi Tagság</Text>
                <Text variant="bodyMedium" style={styles.packageDesc}>Minden prémium funkció elérése</Text>
                <Text variant="headlineMedium" style={styles.packagePrice}>1 990 Ft <Text variant="bodySmall">/ hó</Text></Text>
              </Card.Content>
              <Card.Actions style={styles.cardActions}>
                <Button
                  mode="contained"
                  style={styles.purchaseButton}
                  contentStyle={styles.purchaseButtonContent}
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
                    onPress={() => handlePurchase(pkg)}
                  >
                    Vásárlás
                  </Button>
                </Card.Actions>
              </Card>
            ))
          )}
        </View>
      )}

      {/* Műveletek gomb */}
      <Button mode="text" onPress={handleRestore} style={styles.restoreButton} labelStyle={styles.restoreButtonLabel}>
        Korábbi vásárlások visszaállítása
      </Button>

      <Text variant="bodySmall" style={styles.disclaimer}>
        Az előfizetés automatikusan megújul, de bármikor lemondható a Google Play Áruház fiók beállításaiban.
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
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
});
