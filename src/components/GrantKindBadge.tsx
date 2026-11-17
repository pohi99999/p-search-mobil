import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { grantKindLabel, type GrantKind } from '../lib/grantKind';

interface Props {
  grantType: string | null | undefined;
  /** The list card shows the short word, the detail view the parts of a mixed offer too. */
  variant?: 'short' | 'detail';
  style?: StyleProp<ViewStyle>;
}

/** The kind of the offer as a label; renders nothing for an empty or unrecognised grant_type. */
export function GrantKindBadge({ grantType, variant = 'short', style }: Props) {
  const info = grantKindLabel(grantType);
  if (!info) return null;
  const colors = KIND_COLORS[info.kind];
  return (
    <View
      style={[styles.badge, { backgroundColor: colors.bg }, style]}
      testID="grant-kind-badge"
      accessible
      accessibilityLabel={`Típus: ${info.detail}`}
    >
      <Text variant="labelMedium" style={[styles.text, { color: colors.fg }]}>
        {variant === 'detail' ? info.detail : info.label}
      </Text>
    </View>
  );
}

// The word carries the meaning, the colour only helps scanning. Each pair stays above 4.5:1 under the stale card's
// opacity 0.75 too (GrantKindBadge test).
export const KIND_COLORS: Record<GrantKind, { bg: string; fg: string }> = {
  grant: { bg: '#E8F5E9', fg: '#14491A' },
  loan: { bg: '#FFF3E0', fg: '#633500' },
  equity: { bg: '#EDE7F6', fg: '#3A2085' },
  mixed: { bg: '#E3F2FD', fg: '#0B3D85' },
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  text: {
    fontWeight: 'bold',
  },
});
