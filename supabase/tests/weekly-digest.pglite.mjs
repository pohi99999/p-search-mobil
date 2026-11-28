// Weekly digest opt-in (round 6, item A), checked in PGlite with the real migration file: what the app may write,
// what only the server may write, and the consent stamp the trigger keeps.
//
// Run: npm run test:sql
// To see the tests fail without the migration: PGLITE_SKIP_MIGRATIONS=20261126120000 npm run test:sql
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const VERSION = '20261126120000';
const MIGRATION = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', `${VERSION}_weekly_digest.sql`),
  'utf8',
);
const SKIP = (process.env.PGLITE_SKIP_MIGRATIONS ?? '').split(',').map((s) => s.trim()).includes(VERSION);

const ME = randomUUID();
const OTHER = randomUUID();

// profiles as the earlier migrations leave it: own-row UPDATE policy, table UPDATE revoked from the API roles and
// granted back only for the columns the app edits (20260926150000).
const FIXTURE = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create table public.profiles (
    id uuid primary key,
    full_name text, avatar_url text, search_frequency text default 'weekly', next_scan_at timestamptz,
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

let db;

async function as(role, sub, sql, params = []) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub ?? '']);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const row = async (id) =>
  (await db.query('select weekly_digest, weekly_digest_asked_at, weekly_digest_consent_at, weekly_digest_last_sent_at from public.profiles where id = $1', [id])).rows[0];
const denied = (e) => /permission denied/.test(String(e.message));

before(async () => {
  db = new PGlite();
  await db.exec(FIXTURE);
  await db.query('insert into public.profiles (id) values ($1), ($2)', [ME, OTHER]);
  if (!SKIP) await db.exec(MIGRATION);
});

after(async () => {
  await db.close();
});

test('the opt-in is off by default, with no stamps', async () => {
  const r = await row(ME);
  assert.equal(r.weekly_digest, false);
  assert.equal(r.weekly_digest_consent_at, null);
  assert.equal(r.weekly_digest_last_sent_at, null);
});

test('the app may opt in on its own row; the consent time is stamped by the server', async () => {
  await as('authenticated', ME, 'update public.profiles set weekly_digest = true, weekly_digest_asked_at = now() where id = $1', [ME]);
  const r = await row(ME);
  assert.equal(r.weekly_digest, true);
  assert.ok(r.weekly_digest_asked_at instanceof Date);
  assert.ok(r.weekly_digest_consent_at instanceof Date);
});

test('the client cannot write the consent or the last-sent stamp', async () => {
  await assert.rejects(as('authenticated', ME, `update public.profiles set weekly_digest_consent_at = '2000-01-01' where id = $1`, [ME]), denied);
  await assert.rejects(as('authenticated', ME, `update public.profiles set weekly_digest_last_sent_at = now() where id = $1`, [ME]), denied);
});

test('an unrelated update (also by the service role) cannot move the consent stamp', async () => {
  const before = (await row(ME)).weekly_digest_consent_at;
  await as('authenticated', ME, `update public.profiles set search_frequency = 'manual' where id = $1`, [ME]);
  await db.exec('set role service_role');
  try {
    await db.query(`update public.profiles set weekly_digest_consent_at = '2000-01-01', weekly_digest_last_sent_at = now() where id = $1`, [ME]);
  } finally {
    await db.exec('reset role');
  }
  const r = await row(ME);
  assert.equal(r.weekly_digest_consent_at.getTime(), before.getTime());
  assert.ok(r.weekly_digest_last_sent_at instanceof Date, 'the service role writes last_sent_at');
});

test('opting out clears the consent stamp; opting in again stamps a new one', async () => {
  await as('authenticated', ME, 'update public.profiles set weekly_digest = false where id = $1', [ME]);
  assert.equal((await row(ME)).weekly_digest_consent_at, null);
  await as('authenticated', ME, 'update public.profiles set weekly_digest = true where id = $1', [ME]);
  assert.ok((await row(ME)).weekly_digest_consent_at instanceof Date);
});

test('nobody opts in for someone else (RLS: the update matches no row)', async () => {
  await as('authenticated', ME, 'update public.profiles set weekly_digest = true where id = $1', [OTHER]);
  assert.equal((await row(OTHER)).weekly_digest, false);
});

test('without pg_cron the migration skips the schedule and still applies; it can be replayed', async () => {
  await db.exec(MIGRATION);
  assert.equal((await row(ME)).weekly_digest, true);
});
