import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { foreignMatchIds, matchOwnership } from './match-ownership.ts';

const OWN = '7fbbe7a7-beac-49c0-a237-ea5092b40d69';
const OTHER = 'bfa2232e-15ed-41d5-a9e7-740ab3de7f88';

Deno.test('own matches are not foreign', () => {
  assertEquals(foreignMatchIds([{ id: 'm1', business_id: OWN }, { id: 'm2', business_id: OWN }], OWN), []);
});

Deno.test('another profile\'s match is reported as foreign', () => {
  assertEquals(foreignMatchIds([{ id: 'm1', business_id: OWN }, { id: 'm2', business_id: OTHER }], OWN), ['m2']);
});

Deno.test('regression: a row shaped like the live table (no business_profile_id field) passes for its owner', () => {
  // Live row shape measured 2026-09-25: id, business_id, grant_id, match_score, match_reasoning, status, created_at.
  const liveRow = { id: 'cbf0b733', business_id: OWN, grant_id: 'g', match_score: 50, status: 'new' } as Record<string, unknown>;
  assertEquals(foreignMatchIds([liveRow as { id: string; business_id: string }], OWN), []);
});

Deno.test('a row without business_id is foreign (never trust a missing owner)', () => {
  assertEquals(foreignMatchIds([{ id: 'm1' }], OWN), ['m1']);
});

// matchOwnership (chat-with-gemini reads the match with the service role, so RLS does not guard it).
type Row = Record<string, unknown> | null;
function fakeClient(rows: { match: Row; profile: Row; matchError?: boolean; profileError?: boolean }) {
  const queries: string[] = [];
  return {
    queries,
    from: (table: string) => {
      const filters: string[] = [];
      const b = {
        select: () => b,
        eq: (col: string, v: string) => { filters.push(`${col}=${v}`); return b; },
        maybeSingle: () => {
          queries.push(`${table}?${filters.join('&')}`);
          if (table === 'grant_matches') return Promise.resolve({ data: rows.match, error: rows.matchError ? { message: 'down' } : null });
          return Promise.resolve({ data: rows.profile, error: rows.profileError ? { message: 'down' } : null });
        },
      };
      return b;
    },
  };
}

Deno.test('matchOwnership: a match of one of the caller\'s profiles is own', async () => {
  const c = fakeClient({ match: { business_id: OWN }, profile: { id: OWN } });
  assertEquals(await matchOwnership(c, 'm1', 'u1'), { status: 'own', businessId: OWN });
  // the profile is looked up by the match's business_id AND the caller's user id
  assertEquals(c.queries, ['grant_matches?id=m1', `business_profiles?id=${OWN}&user_id=u1`]);
});

Deno.test('matchOwnership: a match whose profile is not the caller\'s is foreign', async () => {
  assertEquals(await matchOwnership(fakeClient({ match: { business_id: OTHER }, profile: null }), 'm1', 'u1'), { status: 'foreign' });
  assertEquals(await matchOwnership(fakeClient({ match: { business_id: null }, profile: { id: OWN } }), 'm1', 'u1'), { status: 'foreign' });
});

Deno.test('matchOwnership: no row is missing, a failed lookup is error (never own)', async () => {
  assertEquals(await matchOwnership(fakeClient({ match: null, profile: null }), 'm1', 'u1'), { status: 'missing' });
  assertEquals(await matchOwnership(fakeClient({ match: null, profile: null, matchError: true }), 'm1', 'u1'), { status: 'error' });
  assertEquals(await matchOwnership(fakeClient({ match: { business_id: OWN }, profile: { id: OWN }, profileError: true }), 'm1', 'u1'), { status: 'error' });
});
