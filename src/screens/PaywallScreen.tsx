import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card, useTheme, ActivityIndicator } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { useNavigation } from '@react-navigation/native';

export const PaywallScreen = () => {
  const { packages, purchasePackage, restorePurchases, isLoading, isPro } = useBilling();
  const theme = useTheme();
  const navigation = useNavigation<any>();

  if (isPro) {
    return (
      <View style={styles.centered}>
        <Text variant="headlineMedium" style={{ color: theme.colors.primary, marginBottom: 20 }}>
          Köszönjük az előfizetést! 🎉
        </Text>
        <Text variant="bodyLarge" style={{ textAlign: 'center', marginBottom: 20 }}>
          Már Pro felhasználó vagy, korlátlan hozzáférésed van az összes funkcióhoz!
        </Text>
        <Button mode="contained" onPress={() => navigation.goBack()}>
          Vissza a kezdőlapra
        </Button>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="displaySmall" style={[styles.title, { color: theme.colors.primary }]}>
        P-Search PRO ⭐
      </Text>
      
      <Text variant="bodyLarge" style={styles.subtitle}>
        Lépj szintet és találd meg a legjobb pályázatokat korlátok nélkül!
      </Text>

      <Card style={styles.featureCard}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.featureItem}>✅ Korlátlan AI keresés</Text>
          <Text variant="titleMedium" style={styles.featureItem}>✅ Hozzáférés exkluzív és rejtett pályázatokhoz</Text>
          <Text variant="titleMedium" style={styles.featureItem}>✅ Azonnali push értesítések új pályázatokról</Text>
          <Text variant="titleMedium" style={styles.featureItem}>✅ Reklámmentes élmény</Text>
        </Card.Content>
      </Card>

      {isLoading ? (
        <ActivityIndicator size="large" style={{ marginVertical: 30 }} />
      ) : (
        <View style={styles.packagesContainer}>
          {packages.length === 0 ? (
            <Text>Nincsenek elérhető csomagok jelenleg.</Text>
          ) : (
            packages.map((pkg) => (
              <Button
                key={pkg.identifier}
                mode="contained"
                style={styles.purchaseButton}
                contentStyle={styles.purchaseButtonContent}
                onPress={() => purchasePackage(pkg)}
              >
                Előfizetés - {pkg.product.priceString}
              </Button>
            ))
          )}
        </View>
      )}

      <Button mode="text" onPress={restorePurchases} style={styles.restoreButton}>
        Korábbi vásárlás visszaállítása
      </Button>

      <Button mode="outlined" onPress={() => navigation.goBack()} style={styles.backButton}>
        Folytatás az ingyenes verzióval
      </Button>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 32,
    color: '#666',
  },
  featureCard: {
    width: '100%',
    marginBottom: 32,
    backgroundColor: '#f5f5f5',
  },
  featureItem: {
    marginVertical: 8,
  },
  packagesContainer: {
    width: '100%',
    alignItems: 'center',
  },
  purchaseButton: {
    width: '100%',
    marginVertical: 8,
    borderRadius: 8,
  },
  purchaseButtonContent: {
    paddingVertical: 8,
  },
  restoreButton: {
    marginTop: 16,
  },
  backButton: {
    marginTop: 24,
    width: '100%',
  },
});
