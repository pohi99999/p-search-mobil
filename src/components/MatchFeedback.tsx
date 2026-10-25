import React, { useState, useSyncExternalStore } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { scoreBand, setMatchFeedback, type MatchFeedback as Value } from '../services/events';
import { logger } from '../utils/logger';
import { getMatchFeedback, setStoredMatchFeedback, subscribeMatchFeedback } from '../lib/matchFeedbackStore';

// Card [G2]: the "Hasznos / Nem releváns" answer on a match, for the relevance metric of the closed test (Irisz M3-M5).
// Pressing the chosen answer again clears it. The look is a first version; Lumen owns the final design.
interface Props {
  matchId: string;
  grantId: string;
  score: number;
  /** 1-based position in the home list. */
  rank: number;
  initial?: Value | null;
  /** Placement of the whole block (the card puts it in its actions row, the detail view under the reasoning). */
  style?: StyleProp<ViewStyle>;
}

export function MatchFeedback({ matchId, grantId, score, rank, initial = null, style }: Props) {
  // The answer given in this session wins over the one loaded with the list, so the card and the detail view agree.
  const stored = useSyncExternalStore(subscribeMatchFeedback, () => getMatchFeedback(matchId));
  const value: Value | null = stored !== undefined ? stored : initial;
  const setValue = (v: Value | null) => setStoredMatchFeedback(matchId, v);
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
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        <Button
          compact
          mode={value === 'useful' ? 'contained' : 'outlined'}
          // Chosen: our blue with white text (4.60:1); not chosen: Paper's outlined (primary text on white).
          buttonColor={value === 'useful' ? SELECTED_BG : undefined}
          textColor={value === 'useful' ? '#FFFFFF' : undefined}
          accessibilityLabel="Hasznos találat"
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
          // Chosen: our blue with white text (4.60:1); not chosen: Paper's outlined (primary text on white).
          buttonColor={value === 'not_relevant' ? SELECTED_BG : undefined}
          textColor={value === 'not_relevant' ? '#FFFFFF' : undefined}
          accessibilityLabel="Nem releváns találat"
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

const SELECTED_BG = '#1976D2';

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderRadius: 8 },
  // #B3261E on white is 6.54:1 (Paper's error colour).
  error: { color: '#B3261E', marginTop: 4 },
});
