import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Surface, Text } from 'react-native-paper';
import { DIGEST_COPY, loadDigestPreference, saveDigestPreference } from '../lib/digestPreference';
import { logger } from '../utils/logger';

interface Props {
  /** Shown only after the first successful search (Marveen 9199). */
  hasSearched: boolean;
}

/**
 * Round 6, item A: the one-time question about the weekly e-mail digest on the home screen. Shown once, after the
 * first successful search, while the question has not been answered; either answer records it, and the card goes.
 * Nothing is shown while the preference cannot be read. The look is Lumen's to refine.
 */
export function DigestOptInCard({ hasSearched }: Props) {
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSearched) return;
    let alive = true;
    loadDigestPreference()
      .then((p) => alive && setShow(p.askedAt === null))
      .catch((err) => logger.warn('A heti összefoglaló beállítása nem olvasható:', err));
    return () => {
      alive = false;
    };
  }, [hasSearched]);

  // show only turns true after the first search: the effect above reads nothing before it
  if (!show) return null;

  const answer = async (enabled: boolean) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveDigestPreference(enabled);
      setShow(false);
    } catch (err) {
      logger.warn('A heti összefoglaló beállítása nem menthető:', err);
      setError(DIGEST_COPY.saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface style={styles.card} elevation={1} testID="digest-opt-in">
      <Text variant="titleMedium" role="heading" aria-level={2}>
        {DIGEST_COPY.title}
      </Text>
      <Text variant="bodyMedium" style={styles.question}>
        {DIGEST_COPY.question}
      </Text>
      <View style={styles.actions}>
        <Button mode="contained" onPress={() => answer(true)} disabled={saving} testID="digest-opt-in-yes">
          {DIGEST_COPY.yes}
        </Button>
        <Button mode="text" onPress={() => answer(false)} disabled={saving} testID="digest-opt-in-no">
          {DIGEST_COPY.no}
        </Button>
      </View>
      {error ? (
        <HelperText type="error" visible testID="digest-opt-in-error">
          {error}
        </HelperText>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, marginBottom: 8, padding: 16, borderRadius: 12, backgroundColor: '#fff' },
  question: { marginTop: 6, color: '#333' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
});
