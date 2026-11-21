import React from 'react';
import { View } from 'react-native';
import { TesterProgress } from './TesterProgress';
import { SearchSummary } from './SearchSummary';
import type { SearchRunResult } from '../lib/searchSummary';

/**
 * vc23: the top of the match list, in one place so the lines several PRs add do not fight over the FlatList header.
 * Order: the tester card, then the summary of the search just run (Lumen L3: the result of what the user just
 * did comes first), then the list's own status lines (`children`, Kenshin's vc23 HomeStatusHeader).
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
      {lastSearch && lastSearch.matchesFound > 0 ? <SearchSummary result={lastSearch} /> : null}
      {children}
    </View>
  );
}
