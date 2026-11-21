import { fetchGrantFreshness } from '../grantFreshness';
import { freshnessLine, newMatchesLine } from '../homeStatusText';

type Result = { data?: unknown; count?: number | null; error?: unknown };

const mockCalls: { kind: 'latest' | 'open'; args: unknown[][] }[] = [];
let mockLatest: Result = {};
let mockOpen: Result = {};

// A chain that records its mockCalls and resolves to the result of the read it builds.
function mockChain(kind: 'latest' | 'open') {
  const record = { kind, args: [] as unknown[][] };
  mockCalls.push(record);
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit', 'or', 'is']) {
    c[m] = (...a: unknown[]) => {
      record.args.push([m, ...a]);
      return c;
    };
  }
  c.maybeSingle = () => Promise.resolve(mockLatest);
  c.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(mockOpen).then(res, rej);
  return c;
}

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(() => {
      // The first from() of a call is the latest-change read, the second the open count.
      return mockChain(mockCalls.length % 2 === 0 ? 'latest' : 'open');
    }),
  },
}));

describe('grantFreshness (round 11-21 #4)', () => {
  beforeEach(() => {
    mockCalls.length = 0;
    mockLatest = { data: { updated_at: '2026-11-21T09:07:00Z' }, error: null };
    mockOpen = { count: 52, error: null };
  });

  it('reads the latest change and the open count with the matching\'s open rule', async () => {
    const now = new Date(2026, 10, 21, 15, 30);
    await expect(fetchGrantFreshness(now)).resolves.toEqual({ updatedAt: '2026-11-21T09:07:00Z', openCount: 52 });
    const open = mockCalls.find((c) => c.kind === 'open')!;
    const startOfToday = new Date(2026, 10, 21).toISOString();
    expect(open.args).toContainEqual(['or', `deadline.is.null,deadline.gte.${startOfToday}`]);
    expect(open.args).toContainEqual(['is', 'source_closed_at', null]);
    expect(open.args[0]).toEqual(['select', 'id', { count: 'exact', head: true }]);
    const latest = mockCalls.find((c) => c.kind === 'latest')!;
    expect(latest.args).toContainEqual(['order', 'updated_at', { ascending: false }]);
  });

  it.each([
    ['latest read error', () => { mockLatest = { data: null, error: { message: 'x' } }; }],
    ['count read error', () => { mockOpen = { count: null, error: { message: 'x' } }; }],
    ['no grant at all', () => { mockLatest = { data: null, error: null }; }],
    ['unreadable time', () => { mockLatest = { data: { updated_at: 'nope' }, error: null }; }],
    ['no count', () => { mockOpen = { count: null, error: null }; }],
  ])('%s: null, the line is not shown', async (_name, arrange) => {
    arrange();
    await expect(fetchGrantFreshness()).resolves.toBeNull();
  });

  it('the texts', () => {
    const day = new Date('2026-11-21T09:07:00Z').toLocaleDateString('hu-HU');
    expect(freshnessLine({ updatedAt: '2026-11-21T09:07:00Z', openCount: 52 })).toBe(
      `Pályázatlista frissítve: ${day} · 52 nyitott pályázat`,
    );
    expect(newMatchesLine(3)).toBe('3 új pályázat a legutóbbi látogatásod óta');
  });
});
