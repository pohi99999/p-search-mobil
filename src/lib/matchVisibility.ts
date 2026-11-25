// P-Search round 6 (Péter 18328, measured by Marveen 9167 on the live data of 2026-11-25): matches below 50 and
// membership / qualification calls (no money paid) are no longer shown. The scoring (supabase/functions/_shared/
// matching.ts MIN_MATCH_SCORE, candidate-filter.ts NON_FINANCIAL_TITLE_RE) stops producing them; this filter hides
// the ones already stored until the next search replaces them. The values are pinned to the server's by a parity
// test (matchVisibility.test.ts reads the two Deno files).

/** The same threshold as the scoring's MIN_MATCH_SCORE. */
export const MIN_VISIBLE_MATCH_SCORE = 50;

/** The same pattern as the scoring's NON_FINANCIAL_TITLE_RE. */
export const NON_FINANCIAL_TITLE_RE = /tagság|tagsági|minősítés|jogviszony/i;

export interface VisibilityFields {
  id: string;
  match_score: number;
  grants?: { title?: string | null; amount_min?: number | null; amount_max?: number | null } | null;
}

/** A membership or qualification call: the title says so AND no amount is given (a missing amount alone may be a gap). */
export function isNonFinancialGrant(grant: VisibilityFields['grants']): boolean {
  if (!grant) return false;
  return grant.amount_min == null && grant.amount_max == null && NON_FINANCIAL_TITLE_RE.test(String(grant.title ?? ''));
}

/**
 * The matches worth showing. A match an action plan hangs on always stays (the user started working on it), the same
 * rule as withoutExpired; like that one, the caller applies it only when the plan list loaded.
 */
export function withoutWeakMatches<T extends VisibilityFields>(rows: T[], planMatchIds: Set<string>): T[] {
  return rows.filter(
    (m) => planMatchIds.has(m.id) || (m.match_score >= MIN_VISIBLE_MATCH_SCORE && !isNonFinancialGrant(m.grants)),
  );
}
