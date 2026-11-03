// The match ownership check of the Copilot chat. The match is read with the service role, so without the check a
// foreign match_id put another company's matched grant into the prompt. The handler runs here with fake clients.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handler, type Deps } from './index.ts';

const CALLER = 'u-1';
const OWN_PROFILE = 'bp-own';
const OTHER_PROFILE = 'bp-other';

type World = { matchBusinessId: string | null };

function setup(w: World) {
  const calls = { rpc: [] as string[], reads: [] as string[], updates: [] as string[] };
  const userClient = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: CALLER } }, error: null }) },
  };
  const rowsFor = (table: string, select: string, f: Record<string, string>) => {
    if (table === 'grant_matches' && select === 'business_id') {
      return w.matchBusinessId === null ? null : { business_id: w.matchBusinessId };
    }
    if (table === 'grant_matches') return { id: f.id, business_id: w.matchBusinessId, grants: { id: 'g-1', title: 'Pályázat' } };
    if (table === 'business_profiles') {
      const owned = f.id === OWN_PROFILE;
      if (f.user_id !== undefined) return owned && f.user_id === CALLER ? { id: f.id } : null;
      return { id: f.id, user_id: owned ? CALLER : 'u-2', company_name: 'Teszt Kft' };
    }
    if (table === 'profiles') return { daily_chat_count: 1, daily_chat_date: new Date().toISOString().slice(0, 10) };
    return [];
  };
  const serviceClient = {
    rpc: (name: string) => { calls.rpc.push(name); return Promise.resolve({ data: [{ allowed: true }], error: null }); },
    from: (table: string) => {
      let select = '';
      const f: Record<string, string> = {};
      const done = () => { calls.reads.push(`${table}:${select}`); return Promise.resolve({ data: rowsFor(table, select, f), error: null }); };
      const b = {
        select: (s: string) => { select = s; return b; },
        eq: (c: string, v: string) => { f[c] = v; return b; },
        in: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: done,
        single: done,
        update: () => { calls.updates.push(table); return b; },
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => done().then(ok, bad),
      };
      return b;
    },
  };
  const env: Record<string, string | undefined> = { SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  const deps: Deps = {
    // deno-lint-ignore no-explicit-any
    createClient: ((_u: string, key: string) => (key === 'service' ? serviceClient : userClient)) as any,
    env: (n) => env[n],
  };
  return { deps, calls };
}

const req = (body: unknown) =>
  new Request('http://x/chat-with-gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: JSON.stringify(body),
  });

Deno.test('a foreign match_id: 403 in Hungarian, the daily chat cap is not consumed, the match is not read', async () => {
  const { deps, calls } = setup({ matchBusinessId: OTHER_PROFILE });
  const res = await handler(req({ message: 'Mennyi a határidő?', match_id: 'm-foreign' }), deps);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, 'Nincs jogosultság a megadott pályázati találathoz');
  assertEquals(calls.rpc, [], 'consume_daily_chat must not run');
  assert(!calls.reads.includes('grant_matches:*, grants(*)'), calls.reads.join(', '));
  assertEquals(calls.updates, []);
});

Deno.test('a foreign match_id next to the caller\'s own profile id is still refused', async () => {
  const { deps, calls } = setup({ matchBusinessId: OTHER_PROFILE });
  const res = await handler(req({ message: 'Szia', business_profile_id: OWN_PROFILE, match_id: 'm-foreign' }), deps);
  assertEquals(res.status, 403);
  assertEquals(calls.rpc, []);
});

Deno.test('an own match_id passes: the cap is consumed and the discussed grant is read', async () => {
  const { deps, calls } = setup({ matchBusinessId: OWN_PROFILE });
  // No GEMINI_API_KEY in the fake env, so the run stops before any AI call (500, the cap given back).
  const res = await handler(req({ message: 'Mennyi a határidő?', match_id: 'm-own' }), deps);
  assert(res.status !== 403, `status ${res.status}`);
  assertEquals(calls.rpc, ['consume_daily_chat']);
  assert(calls.reads.includes('grant_matches:*, grants(*)'), calls.reads.join(', '));
  assert(calls.reads.includes('business_profiles:*'), 'the match profile is used as company data');
});

Deno.test('an unknown match_id: no 403, the chat goes on without reading a grant', async () => {
  const { deps, calls } = setup({ matchBusinessId: null });
  const res = await handler(req({ message: 'Szia', match_id: 'm-missing' }), deps);
  assert(res.status !== 403, `status ${res.status}`);
  assertEquals(calls.rpc, ['consume_daily_chat']);
  assert(!calls.reads.includes('grant_matches:*, grants(*)'), calls.reads.join(', '));
});
