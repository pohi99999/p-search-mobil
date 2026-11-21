import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, List } from 'react-native-paper';

/** The feature titles' blue (#1565C0, 5.75:1 on white). */
const ICON_COLOR = '#1565C0';

/** The Pro features, the strongest first. */
export const PAYWALL_FEATURES: { icon: string; title: string; description: string }[] = [
  {
    icon: 'file-document-edit-outline',
    title: 'Akcióterv és pályázati dokumentum',
    description: 'Az AI lépésenkénti felkészülési tervet és dokumentum-vázlatot készít a kiválasztott pályázathoz, PDF-ben letölthetően.',
  },
  {
    icon: 'calendar-sync',
    title: 'Napi automatikus figyelés',
    description: 'Az AI akár naponta lefuttatja a keresést a cégednek, így nem maradsz le az új kiírásokról. Ingyen hetente.',
  },
  {
    icon: 'magnify',
    title: 'Korlátlan keresés és Copilot',
    description: 'Ingyen naponta 3 keresés és 5 Copilot-üzenet jár.',
  },
  {
    icon: 'advertisements-off',
    title: 'Hirdetésmentesség',
    description: 'Tiszta, reklám nélküli felület.',
  },
];

export const PaywallFeatures = () => {
  return (
    <Card style={styles.featureCard} mode="outlined">
      <Card.Content>
        {/* Only what the app really does (owner-approved text, Telegram 6057, card bc8e4135). The descriptions
            may run to 8 lines: at 3 the Copilot one was cut on the phone (card a96dd8e2 #4).
            vc23 (Lumen L7): the app's own icons instead of emoji (an emoji looks different on every phone and
            stuck to the title without a space). The free/Pro line is Péter's (Telegram 17591, Marveen 8472):
            free finds, Pro keeps you on time and gets you to the submission; unlimited search is not the lead.
            The numbers are the server's caps (entitlement.ts, Kenshin's vc23 PR). No deadline reminder here
            until it ships. */}
        {PAYWALL_FEATURES.map((f) => (
          <List.Item
            key={f.title}
            title={f.title}
            left={(props) => <List.Icon {...props} icon={f.icon} color={ICON_COLOR} />}
            titleStyle={styles.featureTitle}
            // 3, not 2: with the icon, "Akcióterv és pályázati dokumentum" needed 3 lines at 320 px and was cut (web).
            titleNumberOfLines={3}
            description={f.description}
            descriptionStyle={styles.featureDesc}
            descriptionNumberOfLines={8}
          />
        ))}
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
