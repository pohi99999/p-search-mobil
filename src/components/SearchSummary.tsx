import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { searchSummaryText, type SearchRunResult } from '../lib/searchSummary';

/**
 * vc23 (Lumen L3): the line at the top of the list after a search, in place of the "AI keresés kész" modal.
 * The ratio (open grants weighed -> the ones that fit) is the work the search saved; the modal hid it.
 * A search that found nothing gets the line too, in a neutral tone (Ellenőr #268: with a list already on screen
 * the user got no answer at all).
 */
export function SearchSummary({ result }: { result: SearchRunResult }) {
  const found = result.matchesFound > 0;
  return (
    <View style={[styles.row, found ? styles.found : styles.none]} testID="search-summary" accessibilityRole="summary">
      <Icon source={found ? 'check-decagram' : 'information-outline'} size={20} color={found ? '#2E7D32' : '#455A64'} />
      <Text variant="bodyMedium" style={[styles.text, found ? styles.foundText : styles.noneText]}>
        {searchSummaryText(result)}
      </Text>
    </View>
  );
}

/**
 * Web only: a polite live region that exists from the first render, so a screen reader hears the summary when the
 * search ends (Ellenőr #268: announceForAccessibility gives nothing in a browser, and the modal it replaced did).
 * Native keeps announceForAccessibility in useHomeData; this renders nothing there, so nothing is heard twice.
 */
export function SearchAnnouncer({ result }: { result: SearchRunResult | null }) {
  if (Platform.OS !== 'web') return null;
  return (
    <View aria-live="polite" style={styles.visuallyHidden} testID="search-announcer">
      <Text>{result ? searchSummaryText(result) : ''}</Text>
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
  },
  found: { backgroundColor: '#E8F5E9' },
  none: { backgroundColor: '#ECEFF1' },
  text: { flex: 1 },
  // #1B5E20 on #E8F5E9 is 7.0:1; #37474F on #ECEFF1 is 8.35:1.
  foundText: { color: '#1B5E20' },
  noneText: { color: '#37474F' },
  // Off-screen, still in the accessibility tree (not display: none, not opacity 0).
  visuallyHidden: {
    position: 'absolute',
    left: -10000,
    top: 0,
    width: 1,
    height: 1,
    overflow: 'hidden',
  },
});
