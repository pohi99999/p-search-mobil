import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { freshnessLine, newMatchesLine, type GrantFreshness } from '../lib/homeStatusText';

interface HomeStatusHeaderProps {
  /** Matches newer than the previous visit (#2). 0 shows no line. */
  newCount: number;
  /** The grant list's freshness (#4); null shows no line. */
  freshness: GrantFreshness | null;
}

/**
 * P-Search round 11-21: the two status lines above the match list. Nothing is rendered when there is nothing to say,
 * so a failed read never shows a guess.
 */
export function HomeStatusHeader({ newCount, freshness }: HomeStatusHeaderProps) {
  if (newCount <= 0 && !freshness) return null;
  return (
    <View style={styles.container} testID="home-status-header">
      {newCount > 0 && (
        <View style={styles.newRow} accessibilityRole="text" testID="home-status-new">
          <Icon source="star-four-points" size={18} color="#0D47A1" />
          <Text variant="titleSmall" style={styles.newText}>
            {newMatchesLine(newCount)}
          </Text>
        </View>
      )}
      {freshness && (
        <Text variant="bodySmall" style={styles.freshText} testID="home-status-freshness">
          {freshnessLine(freshness)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
  },
  // Contrast: #0D47A1 on #E3F2FD is 7.6:1.
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  newText: {
    marginLeft: 8,
    color: '#0D47A1',
    flexShrink: 1,
  },
  // #555 on the list's #f5f5f5 background: 6.8:1.
  freshText: {
    color: '#555555',
  },
});
