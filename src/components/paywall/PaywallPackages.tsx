import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import { PurchasesPackage } from 'react-native-purchases';

interface PaywallPackagesProps {
  packages: PurchasesPackage[];
  purchasing: boolean;
  handlePurchase: (pkg: PurchasesPackage) => void;
}

export const PaywallPackages = ({ packages, purchasing, handlePurchase }: PaywallPackagesProps) => {
  return (
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
  );
};

const styles = StyleSheet.create({
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
  popularBadge: {
    color: '#FF6F00',
    fontWeight: 'bold',
    marginBottom: 4,
    fontSize: 11,
    letterSpacing: 0.5,
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
  pricePeriod: {
    color: '#757575',
    fontSize: 14,
  },
  trialNote: {
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 4,
    fontSize: 12,
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
});
