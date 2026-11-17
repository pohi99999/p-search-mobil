// The daily grant ingest's write (public.ingest_grants_apply, migration 20261113120000) on a real Postgres engine
// (PGlite), with the real grants migrations replayed: 20260912140000 (UNIQUE source_url), 20261025141000
// (source_closed_at) and the new one. Marveen 7326, Péter GO 15383.
//
// The key property: two overlapping runs (both planned against the same snapshot, so the app-side dedup cannot help)
// end with each call exactly once, and neither run fails. Take "ON CONFLICT (source_url) DO NOTHING" out of the
// migration and the overlap test goes red (the second run hits the unique constraint).
// To see it: PGLITE_SKIP_MIGRATIONS=20261113120000 npm run test:sql  (then the function is missing: every test fails).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const MIGRATIONS = ['20260912140000_grants_source_url_unique.sql', '20261025141000_grants_source_closed_at.sql', '20261113120000_grant_ingest_daily.sql'];
const SKIP = (process.env.PGLITE_SKIP_MIGRATIONS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

let db;

// The grants columns of 20260618102838_init_rag_grants.sql (that file also needs pgvector, which is not needed here).
const FIXTURE = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create table public.grants (
    id uuid primary key default gen_random_uuid(),
    title text not null, provider text, grant_type text,
    amount_min bigint default 0, amount_max bigint, deadline timestamptz,
    eligibility_criteria text, description text, source_url text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  alter table public.grants enable row level security;
  grant select, insert, update, delete on public.grants to service_role;
`;

const url = (code) => `https://www.palyazat.gov.hu/palyazatok/redirect?code=${code}`;
const grant = (code, deadline = '2026-12-31T22:00:00Z') => ({
  title: `Pályázat ${code}`, description: null, provider: 'Program', grant_type: 'Vissza nem térítendő támogatás (VNT)',
  amount_min: 1000000, amount_max: 5000000, deadline, eligibility_criteria: null, source_url: url(code),
});
const apply = async (insert, update = [], close = [], closedAt = '2026-11-13T04:23:00Z') =>
  (await db.query('select public.ingest_grants_apply($1::jsonb, $2::jsonb, $3::text[], $4::timestamptz) as r',
    [JSON.stringify(insert), JSON.stringify(update), close, closedAt])).rows[0].r;
const count = async (where = 'true') => Number((await db.query(`select count(*)::int as n from public.grants where ${where}`)).rows[0].n);

before(async () => {
  db = new PGlite();
  await db.exec(FIXTURE);
  for (const m of MIGRATIONS) if (!SKIP.some((s) => m.startsWith(s))) await db.exec(readFileSync(join(MIGRATIONS_DIR, m), 'utf8'));
});
after(async () => { await db?.close(); });

test('a first run inserts every call, a re-run of the same plan inserts none', async () => {
  const batch = ['A', 'B', 'C'].map((c) => grant(c));
  assert.deepEqual(await apply(batch), { inserted: 3, updated: 0, closed: 0 });
  assert.deepEqual(await apply(batch), { inserted: 0, updated: 0, closed: 0 });
  assert.equal(await count(), 3);
});

test('two overlapping runs planned on the same snapshot: each call once, and neither run fails', async () => {
  const batch = ['D', 'E'].map((c) => grant(c));
  const [r1, r2] = await Promise.all([apply(batch), apply(batch)]);
  assert.equal(r1.inserted + r2.inserted, 2);
  assert.equal(await count(`source_url in ('${url('D')}', '${url('E')}')`), 2);
  assert.equal(Number((await db.query('select count(*)::int as n from (select source_url from public.grants group by source_url having count(*) > 1) d')).rows[0].n), 0);
});

test('a changed deadline is updated and reopens a closed call; nothing else moves', async () => {
  await db.query(`update public.grants set source_closed_at = '2026-11-01T00:00:00Z' where source_url = $1`, [url('A')]);
  const r = await apply([], [{ source_url: url('A'), deadline: '2027-01-31T22:00:00Z', source_closed_at: null }]);
  assert.deepEqual(r, { inserted: 0, updated: 1, closed: 0 });
  const row = (await db.query('select deadline, source_closed_at from public.grants where source_url = $1', [url('A')])).rows[0];
  assert.equal(new Date(row.deadline).toISOString(), '2027-01-31T22:00:00.000Z');
  assert.equal(row.source_closed_at, null);
});

test('a call gone from the source is stamped closed, never deleted, and a second close keeps the first stamp', async () => {
  const before = await count();
  assert.deepEqual(await apply([], [], [url('B')], '2026-11-13T04:23:00Z'), { inserted: 0, updated: 0, closed: 1 });
  assert.deepEqual(await apply([], [], [url('B')], '2026-11-14T04:23:00Z'), { inserted: 0, updated: 0, closed: 0 });
  assert.equal(await count(), before, 'no row deleted');
  const row = (await db.query('select source_closed_at from public.grants where source_url = $1', [url('B')])).rows[0];
  assert.equal(new Date(row.source_closed_at).toISOString(), '2026-11-13T04:23:00.000Z');
});

test('the apply is all or nothing: one bad row in the batch writes nothing', async () => {
  const before = await count();
  await assert.rejects(apply([grant('F'), { ...grant('G'), deadline: 'not a date' }]));
  assert.equal(await count(), before);
});

test('only the server may call it, and the run log is closed to the app', async () => {
  const can = async (role, sql) => (await db.query(sql.replace('$ROLE', role))).rows[0].ok;
  for (const role of ['anon', 'authenticated']) {
    assert.equal(await can(role, "select has_function_privilege('$ROLE', 'public.ingest_grants_apply(jsonb, jsonb, text[], timestamptz)', 'EXECUTE') as ok"), false, role);
    assert.equal(await can(role, "select has_table_privilege('$ROLE', 'public.grant_ingest_runs', 'SELECT') as ok"), false, role);
    assert.equal(await can(role, "select has_table_privilege('$ROLE', 'public.grant_ingest_runs', 'INSERT') as ok"), false, role);
  }
  assert.equal(await can('service_role', "select has_function_privilege('$ROLE', 'public.ingest_grants_apply(jsonb, jsonb, text[], timestamptz)', 'EXECUTE') as ok"), true);
});

test('the run log takes a run as the function records it', async () => {
  await db.query(`insert into public.grant_ingest_runs (started_at, finished_at, status, fetched, inserted, error)
                  values (now(), now(), 'error', 0, 0, 'the source returned 0 Aktív calls; nothing written')`);
  await assert.rejects(db.query(`insert into public.grant_ingest_runs (started_at, finished_at, status) values (now(), now(), 'weird')`));
});
