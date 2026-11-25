import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Round 6 (Lumen P1-3, Kenshin 9171): the home header's three ways on had icons only, 38 x 38 px, and two of them
// (the followed grants and the document upload) were reachable nowhere else. Now each has its label under the icon,
// a 48 px tall target, and the three share the header's width. The bottom tab bar stays a proposal for a later round
// (no navigator change before the Wednesday phone test).
//
// The visible label is part of the accessible name (WCAG 2.5.3): "Dokumentumok" is inside "Pénzügyi dokumentumok
// feltöltése", and so on.

export type HomeHeaderAction = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID: string;
};

/** #424242 on white is 10.05:1; the icon the same colour. */
const INK = '#424242';

export function HomeHeaderActions({ actions }: { actions: HomeHeaderAction[] }) {
  return (
    <View style={styles.row} testID="home-header-actions">
      {actions.map((a) => (
        <Pressable
          key={a.testID}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityLabel={a.accessibilityLabel}
          testID={a.testID}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name={a.icon} size={22} color={INK} />
          {/* Two lines at most, centred: at 360 px one line cut "Dokumentum feltöltése" (measured). */}
          <Text variant="labelMedium" style={styles.label} numberOfLines={2}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 4,
  },
  action: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderRadius: 8,
  },
  pressed: {
    backgroundColor: '#EEF2F7',
  },
  // labelMedium's 0.5 letter spacing broke "Dokumentumok" inside the word at 320 px (93 px wide); 0.1 keeps it whole.
  label: {
    color: INK,
    marginTop: 2,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
});
