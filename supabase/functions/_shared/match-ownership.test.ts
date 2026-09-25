import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { foreignMatchIds } from './match-ownership.ts';

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
