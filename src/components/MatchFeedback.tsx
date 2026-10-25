import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { scoreBand, setMatchFeedback, type MatchFeedback as Value } from '../services/events';
import { logger } from '../utils/logger';

// Card [G2]: the "Hasznos / Nem releváns" answer on a match, for the relevance metric of the closed test (Irisz M3-M5).
// Pressing the chosen answer again clears it. The look is a first version; Lumen owns the final design.
interface Props {
  matchId: string;
  grantId: string;
  score: number;
  /** 1-based position in the home list. */
  rank: number;
  initial?: Value | null;
}

export function MatchFeedback({ matchId, grantId, score, rank, initial = null }: Props) {
  const [value, setValue] = useState<Value | null>(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const choose = async (next: Value) => {
    if (saving) return;
    const target = value === next ? null : next;
    const before = value;
    setValue(target);
    setSaving(true);
    setFailed(false);
    try {
      await setMatchFeedback({ match_id: matchId, grant_id: grantId, rank, score_band: scoreBand(score) }, target);
    } catch (e) {
      logger.warn('match feedback not saved:', e);
      setValue(before);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Button
          compact
          mode={value === 'useful' ? 'contained' : 'outlined'}
          icon="thumb-up-outline"
          onPress={() => choose('useful')}
          accessibilityState={{ selected: value === 'useful', busy: saving }}
          testID={`feedback-useful-${matchId}`}
          style={styles.button}
        >
          Hasznos
        </Button>
        <Button
          compact
          mode={value === 'not_relevant' ? 'contained' : 'outlined'}
          icon="thumb-down-outline"
          onPress={() => choose('not_relevant')}
          accessibilityState={{ selected: value === 'not_relevant', busy: saving }}
          testID={`feedback-not-relevant-${matchId}`}
          style={styles.button}
        >
          Nem releváns
        </Button>
      </View>
      {failed && (
        <Text variant="bodySmall" style={styles.error} testID={`feedback-error-${matchId}`}>
          Nem sikerült menteni, próbáld újra.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { flexGrow: 1 },
  error: { color: '#B00020', marginTop: 4 },
});
