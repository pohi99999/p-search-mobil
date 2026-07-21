import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, List } from 'react-native-paper';

export const PaywallFeatures = () => {
  return (
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
