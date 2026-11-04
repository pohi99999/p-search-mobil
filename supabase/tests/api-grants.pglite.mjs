// Privileges of the API roles on grant_matches, grants and processed_webhook_events, checked in PGlite
// (in-process Postgres, no network, no live database).
//
// Builds minimal versions of the tables with RLS on and the policies the repository's migrations define, then
// replays the real migration files in timestamp order:
//   20261004113200_processed_webhook_events_deny_clients.sql
//   20261021120000_explicit_api_grants.sql
//   20261029120000_grant_matches_revoke_update.sql
//   20261104120000_api_roles_tighten_table_privileges.sql
//
// Run: npm run test:sql
// To see the test fail without the new migration: PGLITE_SKIP_MIGRATIONS=20261104120000 npm run test:sql
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const MIGRATIONS = [
  '20261004113200_processed_webhook_events_deny_clients.sql',
  '20261021120000_explicit_api_grants.sql',
  '20261029120000_grant_matches_revoke_update.sql',
  '20261104120000_api_roles_tighten_table_privileges.sql',
];
const SKIP = (process.env.PGLITE_SKIP_MIGRATIONS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const readMigration = (name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8');

/** The real set_match_feedback() from 20261025120000, cut out of the file (the rest of that file is not needed). */
function setMatchFeedbackSql() {
  const src = readMigration('20261025120000_app_events_and_match_feedback.sql');
  const m = src.match(/CREATE OR REPLACE FUNCTION public\.set_match_feedback[\s\S]*?\n\$\$;/);
  if (!m) throw new Error('set_match_feedback definition not found in 20261025120000');
  return m[0];
}

// Ids are generated per run, nothing key-shaped is committed.
const OWNER = randomUUID();
const OTHER = randomUUID();
const BIZ_OWNER = randomUUID();
const BIZ_OTHER = randomUUID();
const GRANT_A = randomUUID();
const GRANT_B = randomUUID();
const MATCH_OWN = randomUUID();
const MATCH_OTHER = randomUUID();

let db;

const FIXTURE = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  grant usage on schema public to anon, authenticated, service_role;

  -- auth.uid() as Supabase defines it: the "sub" claim of the request JWT.
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  -- business_profiles: only what the grant_matches policies and set_match_feedback need.
  create table public.business_profiles (
    id uuid primary key,
    user_id uuid not null,
    company_name text not null default 'x'
  );
  alter table public.business_profiles enable row level security;
  create policy "Users can view own business profile" on public.business_profiles
    for select using ((select auth.uid()) = user_id);

  -- grants (20260618102838_init_rag_grants.sql; its client SELECT policy was dropped in 20260822090000).
  create table public.grants (
    id uuid primary key,
    title text not null,
    source_url text
  );
  alter table public.grants enable row level security;
  create policy "Allow all access for service_role on grants" on public.grants
    for all to service_role using (true) with check (true);

  -- grant_matches (policies of 20260817120000_scheduling_and_matching.sql, columns of 20261025120000).
  create table public.grant_matches (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.business_profiles(id),
    grant_id uuid not null references public.grants(id),
    match_score integer,
    match_reasoning text,
    status text default 'new',
    feedback text check (feedback in ('useful', 'not_relevant')),
    feedback_at timestamptz,
    unique (business_id, grant_id)
  );
  alter table public.grant_matches enable row level security;
  create policy "Users can view matches for their business" on public.grant_matches for select
    using (business_id in (select id from public.business_profiles where user_id = (select auth.uid())));
  create policy "Users can insert matches for their business" on public.grant_matches for insert
    with check (business_id in (select id from public.business_profiles where user_id = (select auth.uid())));
  create policy "Users can update matches for their business" on public.grant_matches for update
    using (business_id in (select id from public.business_profiles where user_id = (select auth.uid())))
    with check (business_id in (select id from public.business_profiles where user_id = (select auth.uid())));
  create policy "Users can delete matches for their business" on public.grant_matches for delete
    using (business_id in (select id from public.business_profiles where user_id = (select auth.uid())));

  -- processed_webhook_events (20260912150000_daily_search_cap.sql); its policy comes from 20261004113200.
  create table public.processed_webhook_events (
    event_id text primary key,
    processed_at timestamptz not null default now()
  );
  alter table public.processed_webhook_events enable row level security;
`;

async function seed() {
  await db.exec(`
    insert into public.business_profiles (id, user_id) values ('${BIZ_OWNER}', '${OWNER}'), ('${BIZ_OTHER}', '${OTHER}');
    insert into public.grants (id, title) values ('${GRANT_A}', 'A'), ('${GRANT_B}', 'B');
    insert into public.grant_matches (id, business_id, grant_id, match_score)
      values ('${MATCH_OWN}', '${BIZ_OWNER}', '${GRANT_A}', 80), ('${MATCH_OTHER}', '${BIZ_OTHER}', '${GRANT_A}', 70);
    insert into public.processed_webhook_events (event_id) values ('evt-seed');
  `);
}

/** Runs `sql` as `role` (with `sub` as the JWT subject), always back to the superuser afterwards. */
async function as(role, sub, sql, params = []) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub ?? '']);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function assertDenied(role, sub, sql, params = []) {
  await assert.rejects(as(role, sub, sql, params), (err) => {
    assert.match(String(err.message), /permission denied/, `${role}: expected a privilege error for: ${sql}`);
    return true;
  }, `${role} must be refused: ${sql}`);
}

before(async () => {
  db = await PGlite.create();
  await db.exec(FIXTURE);
  await db.exec(setMatchFeedbackSql());
  for (const name of MIGRATIONS) {
    if (SKIP.some((s) => name.startsWith(s))) {
      console.log(`# skipping migration ${name} (PGLITE_SKIP_MIGRATIONS)`);
      continue;
    }
    await db.exec(readMigration(name));
  }
  await seed();
});

after(async () => {
  await db?.close();
});

const CLIENT_ROLES = [
  ['anon', null],
  ['authenticated', OWNER],
];

// (a) anon and authenticated: TRUNCATE, INSERT and DELETE on grant_matches are refused by privilege.
for (const [role, sub] of CLIENT_ROLES) {
  test(`(a) ${role}: TRUNCATE on grant_matches, grants, processed_webhook_events is refused`, async () => {
    await assertDenied(role, sub, 'truncate public.grant_matches');
    await assertDenied(role, sub, 'truncate public.grants cascade');
    await assertDenied(role, sub, 'truncate public.processed_webhook_events');
  });

  test(`(a) ${role}: INSERT into grant_matches is refused (even for an own business)`, async () => {
    await assertDenied(role, sub, `insert into public.grant_matches (business_id, grant_id, match_score) values ($1, $2, 100)`,
      [BIZ_OWNER, GRANT_B]);
  });

  test(`(a) ${role}: DELETE from grant_matches is refused (even an own row)`, async () => {
    await assertDenied(role, sub, `delete from public.grant_matches where id = $1`, [MATCH_OWN]);
  });

  test(`(a) ${role}: UPDATE on grant_matches stays refused (20261029120000)`, async () => {
    await assertDenied(role, sub, `update public.grant_matches set match_score = 100 where id = $1`, [MATCH_OWN]);
  });

  test(`(a) ${role}: INSERT, UPDATE, DELETE on grants are refused`, async () => {
    await assertDenied(role, sub, `insert into public.grants (id, title) values ($1, 'x')`, [randomUUID()]);
    await assertDenied(role, sub, `update public.grants set title = 'x' where id = $1`, [GRANT_A]);
    await assertDenied(role, sub, `delete from public.grants where id = $1`, [GRANT_B]);
  });

  test(`(a) ${role}: no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN left on the three tables`, async () => {
    const { rows } = await db.query(
      `select t, p, has_table_privilege($1, t, p) as has
         from unnest(array['public.grant_matches', 'public.grants', 'public.processed_webhook_events']) as t,
              unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p`,
      [role],
    );
    const held = rows.filter((r) => r.has).map((r) => `${r.t}:${r.p}`);
    assert.deepEqual(held, [], `${role} still holds: ${held.join(', ')}`);
  });

  test(`(a) ${role}: SELECT is kept on the three tables`, async () => {
    for (const t of ['public.grant_matches', 'public.grants', 'public.processed_webhook_events']) {
      const { rows } = await db.query(`select has_table_privilege($1, $2, 'SELECT') as has`, [role, t]);
      assert.equal(rows[0].has, true, `${role} lost SELECT on ${t}`);
    }
  });
}

// (b) authenticated: own grant_matches rows are readable under the policy, and set_match_feedback still works.
test('(b) authenticated: SELECT returns only the own grant_matches rows', async () => {
  // Without the new migration the DELETE in (a) goes through; put the row back so (b) checks only (b).
  await db.query(
    `insert into public.grant_matches (id, business_id, grant_id, match_score) values ($1, $2, $3, 80)
       on conflict do nothing`,
    [MATCH_OWN, BIZ_OWNER, GRANT_A],
  );
  const { rows } = await as('authenticated', OWNER, 'select id from public.grant_matches order by id');
  assert.deepEqual(rows.map((r) => r.id), [MATCH_OWN]);
});

test('(b) authenticated: set_match_feedback updates the feedback of an own match', async () => {
  await as('authenticated', OWNER, `select public.set_match_feedback($1, 'useful')`, [MATCH_OWN]);
  const { rows } = await db.query('select feedback, feedback_at from public.grant_matches where id = $1', [MATCH_OWN]);
  assert.equal(rows[0].feedback, 'useful');
  assert.ok(rows[0].feedback_at, 'feedback_at is set');
});

test('(b) authenticated: set_match_feedback refuses another user\'s match', async () => {
  await assert.rejects(as('authenticated', OWNER, `select public.set_match_feedback($1, 'useful')`, [MATCH_OTHER]),
    /match not found/);
});

test('(b) anon: set_match_feedback is not executable', async () => {
  await assertDenied('anon', null, `select public.set_match_feedback($1, 'useful')`, [MATCH_OWN]);
});

// (c) service_role: INSERT, UPDATE, DELETE and TRUNCATE still work on all three tables.
test('(c) service_role: INSERT, UPDATE, DELETE, TRUNCATE still work', async () => {
  const g = randomUUID();
  const m = randomUUID();
  await as('service_role', null, `insert into public.grants (id, title) values ($1, 'svc')`, [g]);
  await as('service_role', null, `update public.grants set title = 'svc2' where id = $1`, [g]);
  await as('service_role', null,
    `insert into public.grant_matches (id, business_id, grant_id, match_score) values ($1, $2, $3, 90)
       on conflict (business_id, grant_id) do update set match_score = excluded.match_score`,
    [m, BIZ_OWNER, g]);
  const upd = await as('service_role', null, `update public.grant_matches set status = 'stale' where id = $1`, [m]);
  assert.equal(upd.affectedRows, 1);
  const del = await as('service_role', null, `delete from public.grant_matches where id = $1`, [m]);
  assert.equal(del.affectedRows, 1);
  await as('service_role', null, `delete from public.grants where id = $1`, [g]);

  await as('service_role', null, `insert into public.processed_webhook_events (event_id) values ('evt-svc')`);
  await as('service_role', null, `update public.processed_webhook_events set processed_at = now() where event_id = 'evt-svc'`);
  await as('service_role', null, `delete from public.processed_webhook_events where event_id = 'evt-svc'`);

  await as('service_role', null, 'truncate public.processed_webhook_events');
  await as('service_role', null, 'truncate public.grant_matches, public.grants');
  const { rows } = await db.query('select (select count(*) from public.grant_matches)::int as m, (select count(*) from public.grants)::int as g');
  assert.deepEqual(rows[0], { m: 0, g: 0 });
});

// Idempotency: replaying the new migration is a no-op, not an error.
test('the new migration can be replayed', { skip: SKIP.some((s) => '20261104120000'.startsWith(s)) }, async () => {
  await db.exec(readMigration('20261104120000_api_roles_tighten_table_privileges.sql'));
  await db.exec(readMigration('20261104120000_api_roles_tighten_table_privileges.sql'));
});
