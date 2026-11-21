import React from 'react';
import { View } from 'react-native';
import { TesterProgress } from './TesterProgress';
import { SearchSummary } from './SearchSummary';
import type { SearchRunResult } from '../lib/searchSummary';

/**
 * vc23: the top of the match list, in one place so the lines several PRs add do not fight over the FlatList header.
 * Order: the tester card, then the list's own status lines (`children`, e.g. freshness and "new since" from
 * Kenshin's vc23 items), then the last search's summary (Lumen L3).
 */
export function HomeListHeader({
  showTester,
  lastSearch,
  children,
}: {
  showTester: boolean;
  lastSearch: SearchRunResult | null;
  children?: React.ReactNode;
}) {
  return (
    <View testID="home-list-header">
      {showTester ? <TesterProgress /> : null}
      {children}
      {lastSearch && lastSearch.matchesFound > 0 ? <SearchSummary result={lastSearch} /> : null}
    </View>
  );
}
