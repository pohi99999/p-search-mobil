import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import { PROFILE_FIELDS, profileUpdateFromForm, type ProfileFieldKey } from '../lib/profileCompleteness';

/**
 * How many of the fields the matching reads (matching.ts buildProfileText) are filled with a value the save accepts.
 * Ellenőr #273: counting any non-blank text showed 4/4 and green for "0" or "abc" employees, which the save refuses
 * ("egész számot adj meg") and which so never reaches the search. Each field goes through the save's own rule.
 */
export function filledMatchFields(form: Partial<Record<ProfileFieldKey, string>>): number {
  return PROFILE_FIELDS.filter((f) => {
    const one = profileUpdateFromForm({ [f.key]: form[f.key] ?? '' });
    return one.ok && f.key in one.update;
  }).length;
}

/**
 * vc23 (Lumen L8): the onboarding said "Minél több adatot adsz meg, annál pontosabb a találat" only in words. The bar
 * shows it: the four fields the AI search reads besides the name (TEÁOR, létszám, árbevétel, célok).
 */
export function ProfileStrength({ form }: { form: Partial<Record<ProfileFieldKey, string>> }) {
  const filled = filledMatchFields(form);
  const total = PROFILE_FIELDS.length;
  return (
    <View style={styles.wrap} testID="profile-strength">
      <Text variant="labelMedium" style={styles.label}>
        {`A találatot pontosító adatok: ${filled}/${total}`}
      </Text>
      {/* A fixed-height box: on web Paper's ProgressBar is height: 100% (see TesterProgress, vc23 L1). */}
      <View style={styles.barBox}>
        <ProgressBar
          progress={filled / total}
          color={filled === total ? '#2E7D32' : '#1976D2'}
          style={styles.bar}
          accessibilityLabel={`A találatot pontosító adatok: ${filled} a ${total}-ből`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
  // #303F9F on the white card is 8.98:1.
  label: {
    color: '#303F9F',
    marginBottom: 6,
  },
  barBox: {
    height: 6,
  },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8EAF6',
  },
});
