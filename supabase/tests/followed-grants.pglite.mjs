// Followed grants on the server (round 6), checked in PGlite (in-process Postgres, no network, no live database) with
// the real migration file: RLS both ways, the free limit of 3 in the trigger, Pro without a limit, duplicates, and
// the cascade on account deletion.
//
// Run: npm run test:sql
// To see the tests fail without the migration: PGLITE_SKIP_MIGRATIONS=20261125120000 npm run test:sql
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const VERSION = '20261125120000';
const MIGRATION = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', `${VERSION}_followed_grants.sql`),
  'utf8',
);
const SKIP = (process.env.PGLITE_SKIP_MIGRATIONS ?? '').split(',').map((s) => s.trim()).includes(VERSION);

// Ids are generated per run.
const FREE = randomUUID();
const PRO = randomUUID();
const OTHER = randomUUID();
const GRANTS = Array.from({ length: 6 }, () => randomUUID());

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
  create table auth.users (id uuid primary key);

  create table public.profiles (id uuid primary key references auth.users (id) on delete cascade, subscription_tier text not null default 'free');
  create table public.grants (id uuid primary key, title text not null default 'x');
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

const follow = (user, grant, sub = user) =>
  as('authenticated', sub, `insert into public.followed_grants (user_id, grant_id, match_snapshot) values ($1, $2, '{"id":"m"}')`, [user, grant]);
const count = async (user) =>
  (await db.query('select count(*)::int as n from public.followed_grants where user_id = $1', [user])).rows[0].n;

before(async () => {
  db = new PGlite();
  await db.exec(FIXTURE);
  for (const id of [FREE, PRO, OTHER]) await db.query('insert into auth.users (id) values ($1)', [id]);
  await db.query(`insert into public.profiles (id, subscription_tier) values ($1, 'free'), ($2, 'pro'), ($3, 'free')`, [FREE, PRO, OTHER]);
  for (const g of GRANTS) await db.query('insert into public.grants (id) values ($1)', [g]);
  if (!SKIP) await db.exec(MIGRATION);
});

after(async () => {
  await db.close();
});

test('a free user follows 3 grants, the 4th is refused with P0001 follow_limit and not stored', async () => {
  for (const g of GRANTS.slice(0, 3)) await follow(FREE, g);
  await assert.rejects(follow(FREE, GRANTS[3]), (e) => e.code === 'P0001' && /follow_limit/.test(e.message));
  assert.equal(await count(FREE), 3);
});

test('at the limit, re-following a grant already followed is a duplicate (23505), not "limit"', async () => {
  await assert.rejects(follow(FREE, GRANTS[0]), (e) => e.code === '23505');
  const { rows } = await as(
    'authenticated',
    FREE,
    `insert into public.followed_grants (user_id, grant_id, match_snapshot) values ($1, $2, '{}') on conflict do nothing returning grant_id`,
    [FREE, GRANTS[1]],
  );
  assert.equal(rows.length, 0);
  assert.equal(await count(FREE), 3);
});

test('after an unfollow the free user can follow again', async () => {
  await as('authenticated', FREE, 'delete from public.followed_grants where grant_id = $1', [GRANTS[2]]);
  await follow(FREE, GRANTS[4]);
  assert.equal(await count(FREE), 3);
});

test('a Pro user has no limit', async () => {
  for (const g of GRANTS) await follow(PRO, g);
  assert.equal(await count(PRO), 6);
});

test('RLS: a user sees only their own rows', async () => {
  await follow(OTHER, GRANTS[0]);
  const { rows } = await as('authenticated', OTHER, 'select user_id from public.followed_grants');
  assert.deepEqual([...new Set(rows.map((r) => r.user_id))], [OTHER]);
});

test('RLS: nobody adds a row for someone else, and the answer is RLS, not the other user\'s limit state', async () => {
  // FREE is at the limit: the refusal must not say "follow_limit" (that would leak FREE's list size)
  await assert.rejects(follow(FREE, GRANTS[5], OTHER), (e) => /row-level security/.test(e.message));
  // PRO is not limited: refused the same way
  await assert.rejects(follow(PRO, randomUUID(), OTHER), (e) => /row-level security|foreign key/.test(e.message));
});

test('the service role (no JWT) is held to the limit of the user it writes for', async () => {
  await db.exec('set role service_role');
  try {
    await assert.rejects(
      db.query(`insert into public.followed_grants (user_id, grant_id, match_snapshot) values ($1, $2, '{}')`, [FREE, GRANTS[5]]),
      (e) => e.code === 'P0001',
    );
  } finally {
    await db.exec('reset role');
  }
});

test('RLS: nobody removes someone else\'s row (the delete matches nothing)', async () => {
  const before = await count(PRO);
  await as('authenticated', OTHER, 'delete from public.followed_grants where user_id = $1', [PRO]);
  assert.equal(await count(PRO), before);
});

test('no UPDATE for the app, and nothing at all for anon', async () => {
  await assert.rejects(as('authenticated', FREE, `update public.followed_grants set match_snapshot = '{}' where user_id = $1`, [FREE]), (e) =>
    /permission denied/.test(e.message));
  await assert.rejects(as('anon', null, 'select * from public.followed_grants'), (e) => /permission denied/.test(e.message));
});

test('the limit counts only the inserting user (another free user is not affected)', async () => {
  const fresh = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [fresh]);
  await db.query(`insert into public.profiles (id) values ($1)`, [fresh]);
  for (const g of GRANTS.slice(0, 3)) await follow(fresh, g);
  assert.equal(await count(fresh), 3);
});

test('deleting the account deletes the follows', async () => {
  await db.query('delete from auth.users where id = $1', [OTHER]);
  assert.equal(await count(OTHER), 0);
});

test('the migration can be replayed', async () => {
  await db.exec(MIGRATION);
  assert.equal(await count(PRO), 6);
});
