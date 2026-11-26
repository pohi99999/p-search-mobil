// The weekly digest migration (20261126120000_weekly_digest.sql) with a stand-in pg_cron / pg_net (written by Ellenor
// for the #302 review, 9346/9371): the two Monday cron jobs and what they post, idempotency of the whole file, the exact
// privilege diff, and the rollback the migration header describes. weekly-digest.pglite.mjs skips the pg_cron branch.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '20261126120000_weekly_digest.sql'), 'utf8');
const ME = randomUUID();
const OTHER = randomUUID();
const URL = 'https://icextvgecinmhrhjtfcm.supabase.co/functions/v1/weekly-digest';

const FIXTURE = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles (
    id uuid primary key, full_name text, avatar_url text, search_frequency text default 'weekly', next_scan_at timestamptz,
    updated_at timestamptz, subscription_tier text not null default 'free'
  );
  alter table public.profiles enable row level security;
  create policy own_select on public.profiles for select to authenticated using ((select auth.uid()) = id);
  create policy own_update on public.profiles for update to authenticated using ((select auth.uid()) = id);
  grant select on public.profiles to authenticated;
  grant all on public.profiles to service_role;
  revoke update on public.profiles from anon, authenticated;
  grant update (full_name, avatar_url, search_frequency, next_scan_at, updated_at) on public.profiles to authenticated;
`;
// a stand-in for pg_cron + pg_net + the scheduler secret helper, recording what the migration asks of them
const CRON = `
  create schema cron;
  create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
  create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname, schedule, command) values (n, s, c) returning jobid::bigint $$;
  create function cron.unschedule(n text) returns boolean language sql as $$ with d as (delete from cron.job where jobname = n returning 1) select exists (select 1 from d) $$;
  create schema net;
  create table net.calls (id serial primary key, url text, headers jsonb, body jsonb, timeout_ms int);
  create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) returns bigint language sql as
    $$ insert into net.calls(url, headers, body, timeout_ms) values (url, headers, body, timeout_milliseconds) returning id::bigint $$;
  create function public.get_scheduler_secret() returns text language sql as $$ select 'CANARY-SCHED'::text $$;
`;

let db;
async function as(role, sub, sql, params = []) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub ?? '']);
  try { return await db.query(sql, params); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const row = async (id) => (await db.query('select * from public.profiles where id = $1', [id])).rows[0];
const denied = (e) => /permission denied/.test(String(e.message));
// UPDATE only: SELECT on the new columns is inherited from the table-level SELECT, not granted by the migration
const grants = async () => (await db.query(`select grantee, column_name, privilege_type from information_schema.column_privileges where table_name = 'profiles' and table_schema = 'public' and privilege_type = 'UPDATE' and grantee in ('anon','authenticated') order by 1,2,3`)).rows.map((r) => `${r.grantee}.${r.column_name}.${r.privilege_type}`);

let grantsBefore;
before(async () => {
  db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(CRON);
  await db.query('insert into public.profiles (id) values ($1), ($2)', [ME, OTHER]);
  grantsBefore = await grants();
  await db.exec(MIGRATION);
});
after(async () => { await db.close(); });

test('CRON: exactly two jobs, Monday 05:00 and 06:00 UTC, named per slot', async () => {
  const jobs = (await db.query('select jobname, schedule from cron.job order by jobname')).rows;
  assert.deepEqual(jobs, [
    { jobname: 'p-search-weekly-digest-05', schedule: '0 5 * * 1' },
    { jobname: 'p-search-weekly-digest-06', schedule: '0 6 * * 1' },
  ]);
});

test('CRON: running each job posts to the weekly-digest function with the scheduler bearer and an EMPTY body (never test:true)', async () => {
  const jobs = (await db.query('select command from cron.job order by jobname')).rows;
  for (const j of jobs) await db.exec(j.command);
  const calls = (await db.query('select url, headers, body, timeout_ms from net.calls order by id')).rows;
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(c.url, URL);
    assert.equal(c.headers.Authorization, 'Bearer CANARY-SCHED');
    assert.equal(c.headers['Content-Type'], 'application/json');
    assert.deepEqual(c.body, {});
    assert.equal(c.timeout_ms, 120000);
  }
});

test('CRON: the secret is read when the job RUNS, not baked into the stored command', async () => {
  const { rows } = await db.query('select command from cron.job');
  for (const r of rows) {
    assert.equal(r.command.includes('CANARY-SCHED'), false);
    assert.ok(r.command.includes('public.get_scheduler_secret()'));
  }
});

test('IDEMPOTENT: replaying the whole file twice more keeps two jobs, one trigger, one function, same grants', async () => {
  await db.exec(MIGRATION);
  await db.exec(MIGRATION);
  assert.equal((await db.query('select count(*)::int n from cron.job')).rows[0].n, 2);
  assert.equal((await db.query(`select count(*)::int n from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_weekly_digest_consent'`)).rows[0].n, 1);
  assert.equal((await db.query(`select count(*)::int n from pg_proc where proname = 'stamp_weekly_digest_consent'`)).rows[0].n, 1);
  assert.equal((await db.query(`select count(*)::int n from information_schema.columns where table_name = 'profiles' and column_name like 'weekly_digest%'`)).rows[0].n, 4);
});

test('PRIVILEGES: the migration adds exactly two column grants to authenticated and nothing to anon', async () => {
  const after = await grants();
  const added = after.filter((g) => !grantsBefore.includes(g));
  assert.deepEqual(added, ['authenticated.weekly_digest.UPDATE', 'authenticated.weekly_digest_asked_at.UPDATE']);
  assert.deepEqual(grantsBefore.filter((g) => !after.includes(g)), []);
});

test('the earlier lock holds: entitlement and id columns are still not writable by the app, also next to the new columns', async () => {
  await assert.rejects(as('authenticated', ME, `update public.profiles set subscription_tier = 'pro' where id = $1`, [ME]), denied);
  await assert.rejects(as('authenticated', ME, `update public.profiles set weekly_digest = true, subscription_tier = 'pro' where id = $1`, [ME]), denied);
  assert.equal((await row(ME)).weekly_digest, false, 'a rejected multi-column update must change nothing');
  await assert.rejects(as('authenticated', ME, `update public.profiles set weekly_digest = true, weekly_digest_consent_at = '2000-01-01' where id = $1`, [ME]), denied);
  assert.equal((await row(ME)).weekly_digest, false);
  await assert.rejects(as('authenticated', ME, `update public.profiles set weekly_digest = true, weekly_digest_last_sent_at = now() where id = $1`, [ME]), denied);
  assert.equal((await row(ME)).weekly_digest_last_sent_at, null);
});

test('TRIGGER: an unchanged opt-in with a new "asked" stamp does not move the consent time; an opt-in by the service role is stamped too', async () => {
  await as('authenticated', ME, 'update public.profiles set weekly_digest = true, weekly_digest_asked_at = now() where id = $1', [ME]);
  const first = (await row(ME)).weekly_digest_consent_at;
  assert.ok(first instanceof Date);
  await new Promise((r) => setTimeout(r, 30));
  await as('authenticated', ME, 'update public.profiles set weekly_digest = true, weekly_digest_asked_at = now() where id = $1', [ME]);
  assert.equal((await row(ME)).weekly_digest_consent_at.getTime(), first.getTime());
  await db.exec('set role service_role');
  try { await db.query(`update public.profiles set weekly_digest = true, weekly_digest_consent_at = '2000-01-01' where id = $1`, [OTHER]); } finally { await db.exec('reset role'); }
  const o = await row(OTHER);
  assert.ok(o.weekly_digest_consent_at.getFullYear() >= 2026, 'consent time comes from now(), not from the written value');
});

test('TRIGGER: an opt-out through the unsubscribe path (service role, weekly_digest=false) clears the consent stamp', async () => {
  await db.exec('set role service_role');
  try { await db.query('update public.profiles set weekly_digest = false where id = $1', [ME]); } finally { await db.exec('reset role'); }
  const r = await row(ME);
  assert.equal(r.weekly_digest, false);
  assert.equal(r.weekly_digest_consent_at, null);
});

test('ROLLBACK as the header describes it: drop jobs, trigger, function, revoke the two grants; then the app cannot write the opt-in and nothing is scheduled', async () => {
  await db.exec(`
    select cron.unschedule('p-search-weekly-digest-05'); select cron.unschedule('p-search-weekly-digest-06');
    drop trigger profiles_weekly_digest_consent on public.profiles;
    drop function public.stamp_weekly_digest_consent();
    revoke update (weekly_digest, weekly_digest_asked_at) on public.profiles from authenticated;
  `);
  assert.equal((await db.query('select count(*)::int n from cron.job')).rows[0].n, 0);
  await assert.rejects(as('authenticated', ME, 'update public.profiles set weekly_digest = true where id = $1', [ME]), denied);
  const after = await grants();
  assert.deepEqual(after, grantsBefore, 'the privileges are back to the state before the migration');
  // "the columns can stay (default false = nobody gets anything)": a freshly inserted profile is opted out
  const id = randomUUID();
  await db.query('insert into public.profiles (id) values ($1)', [id]);
  assert.equal((await row(id)).weekly_digest, false);
});
