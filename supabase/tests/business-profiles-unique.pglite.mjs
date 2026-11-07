// One business profile per user, checked in PGlite (in-process Postgres, no network, no live database) with the real
// migration file.
//
// Run: npm run test:sql
// To see the test fail without the migration: PGLITE_SKIP_MIGRATIONS=20261107140000 npm run test:sql
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const VERSION = '20261107140000';
const MIGRATION = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', `${VERSION}_business_profiles_user_id_unique.sql`),
  'utf8',
);
const SKIP = (process.env.PGLITE_SKIP_MIGRATIONS ?? '').split(',').map((s) => s.trim()).includes(VERSION);

const FIXTURE = `
  create table public.business_profiles (id uuid primary key default gen_random_uuid(), user_id uuid not null);
  create index if not exists business_profiles_user_id_idx on public.business_profiles (user_id);
`;

const insert = (db, userId) => db.query('insert into public.business_profiles (user_id) values ($1)', [userId]);
const indexes = async (db) =>
  (await db.query(`select indexname from pg_indexes where tablename = 'business_profiles'`)).rows.map((r) => r.indexname);

let db;

before(async () => {
  db = new PGlite();
  await db.exec(FIXTURE);
  if (!SKIP) await db.exec(MIGRATION);
});

after(async () => {
  await db.close();
});

test('a second profile for the same user is refused with 23505', async () => {
  const user = randomUUID();
  await insert(db, user);
  await assert.rejects(insert(db, user), (e) => e.code === '23505');
});

test('another user can still have a profile', async () => {
  await insert(db, randomUUID());
  await insert(db, randomUUID());
});

test('the unique index replaces the plain one', async () => {
  const names = await indexes(db);
  assert.ok(names.includes('business_profiles_user_id_key'), names.join());
  assert.ok(!names.includes('business_profiles_user_id_idx'), names.join());
});

test('the migration can be replayed', async () => {
  await db.exec(MIGRATION);
});

test('with duplicates present it fails, deletes nothing, and leaves the plain index in place', async () => {
  const dup = new PGlite();
  try {
    await dup.exec(FIXTURE);
    const user = randomUUID();
    await insert(dup, user);
    await insert(dup, user);
    await assert.rejects(dup.exec(`begin; ${MIGRATION} commit;`), (e) => e.code === '23505');
    await dup.exec('rollback');
    const { rows } = await dup.query('select count(*)::int as n from public.business_profiles');
    assert.equal(rows[0].n, 2);
    const names = await indexes(dup);
    assert.ok(names.includes('business_profiles_user_id_idx'), names.join());
    assert.ok(!names.includes('business_profiles_user_id_key'), names.join());
  } finally {
    await dup.close();
  }
});
