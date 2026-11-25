// P-Search round 6 (Péter 18328, Marveen 9167): weak and non-financial matches already stored are hidden, and the
// client's values stay the same as the scoring's (the parity block reads the two Deno files).
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  isNonFinancialGrant,
  MIN_VISIBLE_MATCH_SCORE,
  NON_FINANCIAL_TITLE_RE,
  withoutWeakMatches,
} from '../matchVisibility';

const match = (id: string, score: number, title = 'Eszközbeszerzés', amount: number | null = 10_000_000) => ({
  id,
  match_score: score,
  grants: { title, amount_min: amount, amount_max: null },
});

describe('withoutWeakMatches', () => {
  it('hides a match below 50 and keeps 50 and above', () => {
    const rows = [match('a', 49), match('b', 50), match('c', 92)];
    expect(withoutWeakMatches(rows, new Set()).map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('hides a membership / qualification call with no amount, whatever its score (the two live rows)', () => {
    const rows = [
      match('cyber', 45, 'Kiberbiztonsági kompetenciaközösségi tagsági jogviszony létesítése', null),
      match('cluster', 80, 'Klaszter minősítés', null),
      match('loan', 70, 'KKV Technológia Plusz Budapest Hitelprogram'),
    ];
    expect(withoutWeakMatches(rows, new Set()).map((m) => m.id)).toEqual(['loan']);
  });

  it('keeps a match an action plan hangs on, even when weak or non-financial', () => {
    const rows = [match('weak-with-plan', 41), match('cluster-with-plan', 80, 'Klaszter minősítés', null), match('weak', 41)];
    expect(withoutWeakMatches(rows, new Set(['weak-with-plan', 'cluster-with-plan'])).map((m) => m.id)).toEqual([
      'weak-with-plan',
      'cluster-with-plan',
    ]);
  });
});

describe('isNonFinancialGrant', () => {
  it('needs both the title and the missing amount', () => {
    expect(isNonFinancialGrant({ title: 'Klaszter minősítés', amount_min: null, amount_max: null })).toBe(true);
    expect(isNonFinancialGrant({ title: 'Klaszter minősítés', amount_min: null, amount_max: 10_000_000 })).toBe(false);
    expect(isNonFinancialGrant({ title: 'Eszközbeszerzés', amount_min: null, amount_max: null })).toBe(false);
    expect(isNonFinancialGrant(null)).toBe(false);
  });
});

describe('parity with the scoring (supabase/functions/_shared)', () => {
  const shared = (file: string) => readFileSync(join(__dirname, '../../../supabase/functions/_shared', file), 'utf8');

  it('MIN_VISIBLE_MATCH_SCORE equals matching.ts MIN_MATCH_SCORE', () => {
    const m = shared('matching.ts').match(/export const MIN_MATCH_SCORE = (\d+);/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(MIN_VISIBLE_MATCH_SCORE);
  });

  it('NON_FINANCIAL_TITLE_RE equals candidate-filter.ts NON_FINANCIAL_TITLE_RE', () => {
    const m = shared('candidate-filter.ts').match(/export const NON_FINANCIAL_TITLE_RE = \/(.+)\/([a-z]*);/);
    expect(m).not.toBeNull();
    expect([m![1], m![2]]).toEqual([NON_FINANCIAL_TITLE_RE.source, NON_FINANCIAL_TITLE_RE.flags]);
  });
});
