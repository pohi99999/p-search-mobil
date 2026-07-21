import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';

interface PaywallOverlayProps {
  purchasing: boolean;
}

export const PaywallOverlay = ({ purchasing }: PaywallOverlayProps) => {
  if (!purchasing) return null;

  return (
    <View style={styles.purchasingOverlay}>
      <View style={styles.overlayCard}>
        <ActivityIndicator size="large" color="#1A237E" style={{ marginBottom: 16 }} />
        <Text variant="titleMedium" style={styles.overlayTitle}>Feldolgozás...</Text>
        <Text variant="bodyMedium" style={styles.overlaySubtitle}>
          Kérjük, ne zárd be az appot.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
});
