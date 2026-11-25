import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import { PROFILE_FIELDS, companyFormNumber, type ProfileFieldKey } from '../lib/profileCompleteness';
import { BRAND_BLUE } from '../config/brand';

/**
 * How many of the fields the matching reads (matching.ts buildProfileText) hold a value this form's Save keeps.
 * Ellenőr #273: counting any non-blank text showed 4/4 and green for "abc" employees, which the Save refuses; the
 * first fix used the other form's rule (dots allowed), so "50.000.000" still counted while this Save refuses it.
 * Numbers go through companyFormNumber, the rule validateProfileForm uses, and 0 does not count (the app treats a
 * non-positive number as missing, profileCompleteness isEmpty). Text fields count when not blank.
 */
export function filledMatchFields(form: Partial<Record<ProfileFieldKey, string>>): number {
  return PROFILE_FIELDS.filter((f) => {
    const raw = form[f.key] ?? '';
    if (!f.numeric) return raw.trim() !== '';
    const digits = companyFormNumber(raw);
    return digits !== null && Number(digits) > 0;
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
          color={filled === total ? '#2E7D32' : BRAND_BLUE}
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
