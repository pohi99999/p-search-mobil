import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Card, HelperText, Switch, Text } from 'react-native-paper';
import { DIGEST_COPY, loadDigestPreference, saveDigestPreference } from '../lib/digestPreference';
import { logger } from '../utils/logger';

/**
 * Round 6, item A: the weekly e-mail digest switch in Settings. Off by default. While the preference cannot be read
 * the card is not shown at all (no guessed state that a tap could overwrite, the same rule as the schedule, #291).
 */
export function DigestSwitch({ cardStyle }: { cardStyle?: StyleProp<ViewStyle> }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadDigestPreference()
      .then((p) => alive && setEnabled(p.enabled))
      .catch((err) => {
        logger.warn('A heti összefoglaló beállítása nem olvasható:', err);
        if (alive) setEnabled(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(
    async (next: boolean) => {
      if (saving || enabled === null) return;
      setSaving(true);
      setError(null);
      try {
        const saved = await saveDigestPreference(next);
        setEnabled(saved.enabled);
      } catch (err) {
        logger.warn('A heti összefoglaló beállítása nem menthető:', err);
        setError(DIGEST_COPY.saveError);
      } finally {
        setSaving(false);
      }
    },
    [enabled, saving],
  );

  if (enabled === null) return null;

  return (
    <Card style={cardStyle} mode="elevated" testID="digest-card">
      <View style={styles.row}>
        <View style={styles.text}>
          <Text variant="titleMedium">{DIGEST_COPY.title}</Text>
          <Text variant="bodyMedium" style={styles.description}>
            {DIGEST_COPY.description}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={toggle}
          disabled={saving}
          accessibilityLabel={`${DIGEST_COPY.title}: ${DIGEST_COPY.description}`}
          testID="digest-switch"
        />
      </View>
      {error ? (
        <HelperText type="error" visible testID="digest-switch-error">
          {error}
        </HelperText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  text: { flex: 1 },
  description: { color: '#555', marginTop: 2 },
});
