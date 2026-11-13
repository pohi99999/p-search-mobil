// deno test --allow-read supabase/functions/_shared/   (CI runs this folder)
import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import type { ExistingGrant, Tender } from './mapTender.ts';
import { type ApplyPlan, type IngestDeps, type IngestRun, runIngest, secureCompare } from './runIngest.ts';

const NOW = new Date('2026-11-13T04:23:00Z');
const tender = (code: string, endTime: string | null = '2026-12-31T22:00:00.000Z', status = 'Aktív'): Tender => ({
  id: code, code, name: `Pályázat ${code}`, endTime, status, minSupportAmount: 1_000_000, maxSupportAmount: 5_000_000,
  formOfSupport: 'Vissza nem térítendő támogatás (VNT)', developmentalProgram: 'Program', operationalProgram: '',
  supportPurpose: 'Cél.', conditionsOfSupport: 'Feltétel.', beneficiaries: ['Mikrovállalkozás', 'kisvállalkozás', 'középvállalkozás'],
});
const many = (n: number) => Array.from({ length: n }, (_, i) => tender(`2026-T-${i}`));

function deps(over: Partial<IngestDeps> = {}) {
  const calls: string[] = [];
  const runs: IngestRun[] = [];
  const plans: ApplyPlan[] = [];
  const d: IngestDeps = {
    readExisting: async () => { calls.push('read'); return [] as ExistingGrant[]; },
    fetchTenders: async () => { calls.push('fetch'); return many(25); },
    apply: async (p) => { calls.push('apply'); plans.push(p); return { inserted: p.insert.length, updated: p.update.length, closed: p.close.length }; },
    backfill: async () => { calls.push('backfill'); return 'HTTP 200'; },
    recordRun: async (r) => { calls.push('record'); runs.push(r); },
    now: () => NOW,
    log: () => {},
    ...over,
  };
  return { d, calls, runs, plans };
}

Deno.test('a write run: read, fetch, ONE apply with the plan, backfill, then the run is recorded as ok', async () => {
  const { d, calls, runs, plans } = deps();
  const run = await runIngest(d, { dryRun: false });
  assertEquals(calls, ['read', 'fetch', 'apply', 'backfill', 'record']);
  assertEquals(run.status, 'ok');
  assertEquals([run.fetched, run.to_insert, run.inserted], [25, 25, 25]);
  assertEquals(plans[0].closedAt, NOW.toISOString());
  assertEquals(runs.length, 1);
});

Deno.test('a dry run plans and records, but never applies or backfills', async () => {
  const { d, calls, runs } = deps();
  const run = await runIngest(d, { dryRun: true });
  assertEquals(calls, ['read', 'fetch', 'record']);
  assertEquals([run.status, run.to_insert, run.inserted], ['dry_run', 25, 0]);
  assertEquals(runs[0].status, 'dry_run');
});

Deno.test('an empty answer from the source is an error and writes nothing (not "everything closed")', async () => {
  const { d, calls, runs } = deps({ fetchTenders: async () => [] });
  const run = await runIngest(d, { dryRun: false });
  assertEquals(run.status, 'error');
  assert(run.error?.includes('0 Aktív'));
  assert(!calls.includes('apply'));
  assertEquals(runs.length, 1, 'the failed run is still recorded');
});

Deno.test('a failing source fetch, a failing apply and a failing backfill each end as a recorded error', async () => {
  const fetchFail = deps({ fetchTenders: async () => { throw new Error('tenders/list HTTP 502 at pageIndex 0'); } });
  const r1 = await runIngest(fetchFail.d, { dryRun: false });
  assertEquals([r1.status, fetchFail.calls.includes('apply'), fetchFail.runs.length], ['error', false, 1]);

  const applyFail = deps({ apply: async () => { throw new Error('ingest_grants_apply: boom'); } });
  const r2 = await runIngest(applyFail.d, { dryRun: false });
  assertEquals([r2.status, applyFail.calls.includes('backfill'), applyFail.runs.length], ['error', false, 1]);

  const backfillFail = deps({ backfill: async () => { throw new Error('HTTP 401'); } });
  const r3 = await runIngest(backfillFail.d, { dryRun: false });
  assertEquals([r3.status, r3.inserted, r3.backfill], ['error', 25, 'failed'], 'the rows went in, the chunks did not: still an error');
});

Deno.test('rows already in the DB are not inserted again; a dropped call is closed, not deleted', async () => {
  const urlOf = (code: string) => `https://www.palyazat.gov.hu/palyazatok/redirect?code=${code}`;
  const existing: ExistingGrant[] = [
    { source_url: urlOf('2026-T-0'), deadline: '2026-12-31T22:00:00.000Z', source_closed_at: null },
    { source_url: urlOf('GONE'), deadline: '2026-12-31T22:00:00.000Z', source_closed_at: null },
  ];
  const { d, plans } = deps({ readExisting: async () => existing });
  await runIngest(d, { dryRun: false });
  assert(!plans[0].insert.some((g) => g.source_url === urlOf('2026-T-0')));
  assertEquals(plans[0].close, [urlOf('GONE')]);
});

Deno.test('a run whose record cannot be written still returns its result', async () => {
  const { d } = deps({ recordRun: async () => { throw new Error('insert denied'); } });
  const run = await runIngest(d, { dryRun: false });
  assertEquals(run.status, 'ok');
});

Deno.test('secureCompare: equal passes, a different or a prefix secret fails', () => {
  assert(secureCompare('a'.repeat(64), 'a'.repeat(64)));
  assert(!secureCompare('a'.repeat(64), 'a'.repeat(63) + 'b'));
  assert(!secureCompare('a'.repeat(63), 'a'.repeat(64)));
  assert(!secureCompare('', 'x'));
});
