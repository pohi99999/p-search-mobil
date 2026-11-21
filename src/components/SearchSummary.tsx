import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { searchSummaryText, type SearchRunResult } from '../lib/searchSummary';

/**
 * vc23 (Lumen L3): the line at the top of the list after a search, in place of the "AI keresés kész" modal.
 * The ratio (open grants weighed -> the ones that fit) is the work the search saved; the modal hid it.
 */
export function SearchSummary({ result }: { result: SearchRunResult }) {
  return (
    <View style={styles.row} testID="search-summary" accessibilityRole="summary">
      <Icon source="check-decagram" size={20} color="#2E7D32" />
      <Text variant="bodyMedium" style={styles.text}>
        {searchSummaryText(result)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
  },
  // #1B5E20 on #E8F5E9 is 6.9:1.
  text: {
    flex: 1,
    color: '#1B5E20',
  },
});
