import { sortFreshFirst } from '../matchStatus';

// Card 2428c38f: the owner's list (2026-10-15) mixed 4 fresh and 5 older, not re-scored matches.
it('stale matches go after the fresh ones, score order kept inside each group', () => {
  const rows = [
    { id: 'old-50', status: 'stale', match_score: 50 },
    { id: 'new-45', status: 'new', match_score: 45 },
    { id: 'old-82', status: 'stale', match_score: 82 },
    { id: 'new-82', status: 'new', match_score: 82 },
    { id: 'applied-40', status: 'applied', match_score: 40 },
  ];
  expect(sortFreshFirst(rows).map((r) => r.id)).toEqual(['new-82', 'new-45', 'applied-40', 'old-82', 'old-50']);
});
