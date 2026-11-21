export interface SearchRunResult {
  matchesFound: number;
  candidatesConsidered: number;
}

/**
 * The search summary line (vc23, Lumen L3). `candidatesConsidered` is the number of open grants the AI scored
 * (match-grants: summary.candidates), `matchesFound` those that scored high enough to be shown.
 */
export function searchSummaryText({ matchesFound, candidatesConsidered }: SearchRunResult): string {
  const looked = candidatesConsidered > 0 ? `${candidatesConsidered} nyitott kiírást néztünk át` : 'Lefuttattuk a keresést';
  return matchesFound > 0
    ? `${looked}, ${matchesFound} illik a cégedhez.`
    : `${looked}, most egyik sem illik a cégedhez.`;
}
