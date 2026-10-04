import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, List } from 'react-native-paper';

export const PaywallFeatures = () => {
  return (
    <Card style={styles.featureCard} mode="outlined">
      <Card.Content>
        {/* Only what the app really does (owner-approved text, Telegram 6057, card bc8e4135). */}
        <List.Item
          title="✍️ Copilot akcióterv és pályázati dokumentum"
          titleStyle={styles.featureTitle}
          titleNumberOfLines={2}
          description="A Gemini AI személyre szabott felkészülési tervet és dokumentum-vázlatot készít a kiválasztott pályázathoz, PDF-ben letölthetően."
          descriptionStyle={styles.featureDesc}
          descriptionNumberOfLines={3}
        />
        <List.Item
          title="🔎 Korlátlan AI keresés"
          titleStyle={styles.featureTitle}
          titleNumberOfLines={2}
          description="Nincs napi keresési korlát."
          descriptionStyle={styles.featureDesc}
          descriptionNumberOfLines={3}
        />
        <List.Item
          title="🚫 Hirdetésmentesség"
          titleStyle={styles.featureTitle}
          titleNumberOfLines={2}
          description="Tiszta, reklám nélküli felület."
          descriptionStyle={styles.featureDesc}
          descriptionNumberOfLines={3}
        />
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
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
});
