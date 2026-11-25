export interface SearchRunResult {
  matchesFound: number;
  candidatesConsidered: number;
}

/**
 * The search summary line (vc23, Lumen L3). `candidatesConsidered` is the number of open grants the AI scored
 * (match-grants: summary.candidates), `matchesFound` those that scored high enough to be shown.
 *
 * Round 6 (Kenshin, live 2026-11-25): "12 nyitott kiírást néztünk át" stood right above "56 nyitott pályázat", and read
 * as if most open grants had been skipped. The AI scores the open grants closest to the company profile (at most
 * MAX_CANDIDATES = 12, supabase/functions/_shared/matching.ts), so the line now says that.
 */
export function lookedText(candidatesConsidered: number): string {
  return `A cégprofilodhoz legközelebb álló ${candidatesConsidered} kiírást értékeltük`;
}

export function searchSummaryText({ matchesFound, candidatesConsidered }: SearchRunResult): string {
  const looked = candidatesConsidered > 0 ? lookedText(candidatesConsidered) : 'Lefuttattuk a keresést';
  return matchesFound > 0
    ? `${looked}, ${matchesFound} illik a cégedhez.`
    : `${looked}, most egyik sem illik a cégedhez.`;
}
