import { hasSearchedBefore, isOpenGrant, sortFreshFirst, withoutExpired } from '../matchStatus';

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

describe('expired grants (card [C])', () => {
  const now = new Date(2026, 9, 25, 15, 0); // 2026-10-25 15:00 local
  const at = (y: number, m: number, d: number, h = 0) => new Date(y, m, d, h).toISOString();

  it('a grant is open on its deadline day, closed from the next day', () => {
    expect(isOpenGrant(at(2026, 9, 25), now)).toBe(true);
    expect(isOpenGrant(at(2026, 9, 24, 23), now)).toBe(false);
    expect(isOpenGrant(at(2026, 10, 1), now)).toBe(true);
  });

  it('no deadline (or an unreadable one) counts as open', () => {
    expect(isOpenGrant(null, now)).toBe(true);
    expect(isOpenGrant(undefined, now)).toBe(true);
    expect(isOpenGrant('nem dátum', now)).toBe(true);
  });

  it('drops only the expired matches nobody acted on', () => {
    const past = { deadline: at(2026, 8, 30) };
    const rows = [
      { id: 'open', status: 'new', grants: { deadline: at(2026, 11, 1) } },
      { id: 'expired-new', status: 'new', grants: past },
      { id: 'expired-stale', status: 'stale', grants: past },
      { id: 'expired-interested', status: 'interested', grants: past },
      { id: 'expired-with-plan', status: 'new', grants: past },
      { id: 'no-deadline', status: 'new', grants: { deadline: null } },
    ];
    expect(withoutExpired(rows, new Set(['expired-with-plan']), now).map((r) => r.id)).toEqual([
      'open',
      'expired-interested',
      'expired-with-plan',
      'no-deadline',
    ]);
  });
});

it('searched once a scan ran or there is any match (card [D])', () => {
  expect(hasSearchedBefore(null, 0)).toBe(false);
  expect(hasSearchedBefore(undefined, 0)).toBe(false);
  expect(hasSearchedBefore('2026-10-20T08:00:00Z', 0)).toBe(true);
  expect(hasSearchedBefore(null, 2)).toBe(true);
});

it('a call closed at the source drops like an expired one, unless a plan or a status keeps it (card [H2])', () => {
  const now = new Date(2026, 9, 25, 15, 0);
  const open = { deadline: '2999-01-01T00:00:00Z', source_closed_at: null };
  const closed = { deadline: '2999-01-01T00:00:00Z', source_closed_at: '2026-10-25T10:00:00Z' };
  const rows = [
    { id: 'open', status: 'new', grants: open },
    { id: 'closed-new', status: 'new', grants: closed },
    { id: 'closed-interested', status: 'interested', grants: closed },
    { id: 'closed-with-plan', status: 'new', grants: closed },
  ];
  expect(withoutExpired(rows, new Set(['closed-with-plan']), now).map((r) => r.id)).toEqual(['open', 'closed-interested', 'closed-with-plan']);
});
