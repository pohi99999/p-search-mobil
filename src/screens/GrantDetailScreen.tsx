import React from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBilling } from '../context/BillingContext';
import { useProfile } from '../context/ProfileContext';
import { useActionPlan } from '../hooks/useActionPlan';
import { formatGrantAmount } from '../lib/grantAmount';
import { STALE_MATCH_STATUS } from '../lib/matchStatus';
import { deadlineDetailText, formatDeadline } from '../lib/deadline';
import { logger } from '../utils/logger';
import type { GrantDetailScreenProps } from '../types/navigation';

// Card [B] (review 2026-10-25): "Részletek" opened the action plan, so the grant itself (deadline, official
// link, eligibility) was never on screen. Free view; the Pro offer sits at the bottom. Texts: Stratéga.

/** Only web links are opened: source_url comes from scraped data, not from us. */
export function isOpenableUrl(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url.trim());
}

export function GrantDetailScreen({ route, navigation }: GrantDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { match } = route.params;
  const grant = match.grants;
  const { isPro } = useBilling();
  const { profile } = useProfile();
  // Only a Pro user gets the plan button, so only then is it worth asking whether a plan exists.
  const { plans } = useActionPlan(isPro ? profile?.id : undefined);
  const hasPlan = plans.some((p) => p.match_id === match.id);

  const deadline = formatDeadline(grant?.deadline);
  const expired = deadline.tone === 'expired';
  const amount = formatGrantAmount(grant?.amount_min, grant?.amount_max);
  const stale = match.status === STALE_MATCH_STATUS;
  const rawUrl = grant?.source_url;
  const sourceUrl = isOpenableUrl(rawUrl) ? rawUrl.trim() : null;

  const openSource = () => {
    if (!sourceUrl) return;
    Linking.openURL(sourceUrl).catch((err) => {
      logger.error('A hivatalos kiírás nem nyílt meg:', err);
      Alert.alert('Hiba', 'Nem sikerült megnyitni a kiírást. Próbáld újra később.');
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
          accessibilityLabel="Vissza"
          testID="grant-detail-back-button"
        />
        <Text variant="titleLarge" style={styles.headerTitle}>
          Pályázat részletei
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 32 + insets.bottom }]} testID="grant-detail-scroll">
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <Text variant="titleLarge" style={styles.title}>
              {grant?.title || 'Ismeretlen pályázat'}
            </Text>
            <Text variant="bodyMedium" style={stale ? styles.staleText : styles.matchText}>
              {stale
                ? `Korábbi keresés találata (egyezés akkor: ${match.match_score}%)`
                : `Egyezés a cégeddel: ${match.match_score}%`}
            </Text>

            <Field label="Beadási határidő">
              <Text variant="bodyLarge" style={[styles.value, deadlineStyles[deadline.tone]]} testID="grant-detail-deadline">
                {deadlineDetailText(deadline)}
              </Text>
            </Field>

            <Field label="Összeg">
              <Text variant="bodyLarge" style={amount ? styles.value : styles.missing}>
                {amount ?? 'Az összeget a kiírás nem adja meg egyértelműen, nézd meg a hivatalos kiírásban.'}
              </Text>
            </Field>

            {grant?.provider ? (
              <Field label="Kiíró">
                <Text variant="bodyLarge" style={styles.value}>{grant.provider}</Text>
              </Field>
            ) : null}

            {match.match_reasoning ? (
              <Field label="Miért ajánljuk">
                <Text variant="bodyMedium" style={styles.body}>{match.match_reasoning}</Text>
              </Field>
            ) : null}

            <Field label="Kinek szól">
              <Text variant="bodyMedium" style={grant?.eligibility_criteria ? styles.body : styles.missing}>
                {grant?.eligibility_criteria || 'A jogosultsági feltételeket a hivatalos kiírás tartalmazza.'}
              </Text>
            </Field>

            {grant?.description ? (
              <Field label="Leírás">
                <Text variant="bodyMedium" style={styles.body}>{grant.description}</Text>
              </Field>
            ) : null}

            {sourceUrl ? (
              <Button
                mode="outlined"
                icon="open-in-new"
                onPress={openSource}
                style={styles.sourceButton}
                accessibilityLabel="A hivatalos kiírás megnyitása a böngészőben"
                testID="grant-detail-source"
              >
                Hivatalos kiírás megnyitása
              </Button>
            ) : null}
            <Text variant="bodySmall" style={styles.disclaimer}>
              A P-Search összefoglalja a kiírás adatait, de a beadás előtt mindig a hivatalos kiírás a mérvadó.
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.card} mode="elevated" testID="grant-detail-offer">
          <Card.Content>
            {expired ? (
              <Text variant="bodyMedium" style={styles.body}>
                Ez a kiírás lezárult, beadni már nem lehet. A hasonló, nyitott pályázatokat a kezdőlapon találod.
              </Text>
            ) : (
              <>
                <Text variant="titleMedium" style={styles.offerTitle}>Készülj fel erre a pályázatra</Text>
                {isPro ? (
                  <Button
                    mode="contained"
                    onPress={() => navigation.navigate('ActionPlan', { matchId: match.id })}
                    style={styles.primaryButton}
                    testID="grant-detail-plan"
                  >
                    {hasPlan ? 'Akcióterv megnyitása' : 'Akcióterv készítése'}
                  </Button>
                ) : (
                  <>
                    <Text variant="bodyMedium" style={styles.offerLine}>✍️ Lépésenkénti akcióterv ehhez a kiíráshoz</Text>
                    <Text variant="bodyMedium" style={styles.offerLine}>📄 Dokumentum-vázlat a cégprofilod alapján, PDF-ben</Text>
                    <Button
                      mode="contained"
                      onPress={() => navigation.navigate('Paywall')}
                      style={styles.primaryButton}
                      testID="grant-detail-upgrade"
                    >
                      Pro-ra váltok
                    </Button>
                    <Text variant="bodySmall" style={styles.offerNote}>
                      Az árat és a feltételeket a következő képernyőn látod.
                    </Text>
                  </>
                )}
              </>
            )}
            <Button
              mode="text"
              icon="robot-outline"
              onPress={() => navigation.navigate('CopilotChat', { matchId: match.id })}
              style={styles.copilotButton}
              accessibilityLabel="Kérdezz a Copilottól erről a pályázatról"
              testID="grant-detail-copilot"
            >
              {/* The longer label was cut at 360 px; the full sentence stays in the accessibility label. */}
              Kérdezz a Copilottól
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="labelMedium" style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    elevation: 2,
    marginBottom: 8,
  },
  headerTitle: {
    flex: 1,
    fontWeight: 'bold',
    color: '#1A237E',
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: 'white',
  },
  title: {
    fontWeight: 'bold',
    color: '#1A237E',
    marginBottom: 4,
  },
  matchText: {
    color: '#424242',
  },
  staleText: {
    color: '#616161',
  },
  field: {
    marginTop: 16,
  },
  label: {
    color: '#616161',
    marginBottom: 2,
  },
  value: {
    color: '#212121',
  },
  body: {
    color: '#424242',
    lineHeight: 20,
  },
  missing: {
    color: '#616161',
    fontStyle: 'italic',
  },
  sourceButton: {
    marginTop: 20,
    borderRadius: 8,
  },
  disclaimer: {
    color: '#616161',
    marginTop: 12,
  },
  offerTitle: {
    fontWeight: 'bold',
    color: '#1A237E',
    marginBottom: 8,
  },
  offerLine: {
    color: '#424242',
    marginBottom: 4,
  },
  primaryButton: {
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: '#1A237E',
  },
  offerNote: {
    color: '#616161',
    marginTop: 8,
    textAlign: 'center',
  },
  copilotButton: {
    marginTop: 8,
  },
});

// Same colours as the card's deadline line ([A]); contrast on white 6.57 / 5.19 / 16.1 / 6.19.
const deadlineStyles = StyleSheet.create({
  expired: { color: '#B71C1C', fontWeight: 'bold' },
  soon: { color: '#A15C00', fontWeight: 'bold' },
  normal: { color: '#212121' },
  unknown: { color: '#616161', fontStyle: 'italic' },
});
