import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, IconButton } from 'react-native-paper';

interface PaywallSuccessProps {
  onBack: () => void;
}

export const PaywallSuccess = ({ onBack }: PaywallSuccessProps) => {
  return (
    <View style={styles.centered}>
      <IconButton icon="star-circle" iconColor="#FFD700" size={80} style={styles.proIcon} />
      <Text variant="headlineMedium" style={styles.successTitle}>
        Sikeres Pro Előfizetés! 🎉
      </Text>
      <Text variant="bodyLarge" style={styles.successSubtitle}>
        Köszönjük a bizalmat! Mostantól korlátlan hozzáférésed van az összes prémium funkcióhoz reklámok nélkül.
      </Text>
      <Button mode="contained" onPress={onBack} style={styles.backButtonPro}>
        Vissza a Kezdőlapra
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
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
