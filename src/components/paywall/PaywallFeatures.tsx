import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, List } from 'react-native-paper';

/** The feature titles' blue (#1565C0, 5.75:1 on white). */
const ICON_COLOR = '#1565C0';

export const PaywallFeatures = () => {
  return (
    <Card style={styles.featureCard} mode="outlined">
      <Card.Content>
        {/* Only what the app really does (owner-approved text, Telegram 6057, card bc8e4135). The descriptions
            may run to 8 lines: at 3 the Copilot one was cut on the phone (card a96dd8e2 #4).
            vc23 (Lumen L7): the app's own icons instead of emoji (an emoji looks different on every phone and
            stuck to the title without a space); the search line is neutral until Péter sets the free/Pro limit. */}
        <List.Item
          title="Copilot akcióterv és pályázati dokumentum"
          left={(props) => <List.Icon {...props} icon="file-document-edit-outline" color={ICON_COLOR} />}
          titleStyle={styles.featureTitle}
          titleNumberOfLines={2}
          description="Az AI személyre szabott felkészülési tervet és dokumentum-vázlatot készít a kiválasztott pályázathoz, PDF-ben letölthetően."
          descriptionStyle={styles.featureDesc}
          descriptionNumberOfLines={8}
        />
        <List.Item
          title="Bővebb AI keresés"
          left={(props) => <List.Icon {...props} icon="magnify" color={ICON_COLOR} />}
          titleStyle={styles.featureTitle}
          titleNumberOfLines={2}
          description="Naponta több keresés, mint az ingyenes használatban."
          descriptionStyle={styles.featureDesc}
          descriptionNumberOfLines={8}
        />
        <List.Item
          title="Hirdetésmentesség"
          left={(props) => <List.Icon {...props} icon="advertisements-off" color={ICON_COLOR} />}
          titleStyle={styles.featureTitle}
          titleNumberOfLines={2}
          description="Tiszta, reklám nélküli felület."
          descriptionStyle={styles.featureDesc}
          descriptionNumberOfLines={8}
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
