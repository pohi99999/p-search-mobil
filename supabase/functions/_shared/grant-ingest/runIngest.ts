// One grant-ingest run, shared by the daily Edge Function (ingest-grants-daily, pg_cron) and the manual script
// (scripts/ingest-grants/run.ts). Marveen 7326, Péter GO 15383: until 2026-11-13 the table was only ever loaded by
// hand (09-04, 09-12, 10-25), so the open calls went stale.
//
// What it does, in order: read the grants already in the DB, fetch the Aktív calls from the source, plan the sync
// (mapTender.planGrantSync: new rows, changed deadlines, calls gone from the source), then hand the plan to ONE
// database call (public.ingest_grants_apply) that inserts with ON CONFLICT (source_url) DO NOTHING, updates the
// deadlines and stamps source_closed_at on the closed ones. Nothing is ever deleted: grant_matches point at these rows.
// After a write it asks backfill-grant-chunks to chunk and embed the new rows, or matching cannot see them.
//
// Every run, good or bad, is recorded (public.grant_ingest_runs), so a missing or failed day is visible.
// The I/O is injected, so the order and the failure paths are unit-tested without a network or a database.

import type { ExistingGrant, GrantRecord, GrantUpdate, Tender } from './mapTender.ts';
import { planGrantSync } from './mapTender.ts';

export type ApplyPlan = { insert: GrantRecord[]; update: GrantUpdate[]; close: string[]; closedAt: string };
export type ApplyResult = { inserted: number; updated: number; closed: number };

export type IngestStatus = 'ok' | 'error' | 'dry_run';
export type IngestRun = {
  status: IngestStatus;
  started_at: string;
  finished_at: string;
  fetched: number;
  to_insert: number;
  to_update: number;
  to_close: number;
  inserted: number;
  updated: number;
  closed: number;
  closing_skipped: boolean;
  backfill: string | null;
  error: string | null;
};

export type IngestDeps = {
  readExisting: () => Promise<ExistingGrant[]>;
  fetchTenders: () => Promise<Tender[]>;
  apply: (plan: ApplyPlan) => Promise<ApplyResult>;
  /** Chunk + embed the grants that have none yet; returns a short status for the run record. */
  backfill: () => Promise<string>;
  recordRun: (run: IngestRun) => Promise<void>;
  now: () => Date;
  log: (line: string) => void;
};

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

export async function runIngest(deps: IngestDeps, opts: { dryRun: boolean; kkvOnly?: boolean } = { dryRun: false }): Promise<IngestRun> {
  const started = deps.now();
  const run: IngestRun = {
    status: opts.dryRun ? 'dry_run' : 'ok', started_at: started.toISOString(), finished_at: started.toISOString(),
    fetched: 0, to_insert: 0, to_update: 0, to_close: 0, inserted: 0, updated: 0, closed: 0, closing_skipped: false, backfill: null, error: null,
  };
  try {
    const existing = await deps.readExisting();
    const tenders = await deps.fetchTenders();
    run.fetched = tenders.length;
    // An empty answer from the source is a failure, not "every call closed": write nothing and say so.
    if (tenders.length === 0) throw new Error('the source returned 0 Aktív calls; nothing written');
    const plan = planGrantSync(tenders, existing, { now: started, kkvOnly: opts.kkvOnly });
    run.to_insert = plan.toInsert.length;
    run.to_update = plan.toUpdate.length;
    run.to_close = plan.toClose.length;
    run.closing_skipped = plan.closingSkipped;
    deps.log(`[ingest] fetched=${run.fetched} toInsert=${run.to_insert} toUpdate=${run.to_update} toClose=${run.to_close}${plan.closingSkipped ? ' (closing skipped: too few Aktív calls to trust)' : ''}`);
    if (!opts.dryRun) {
      const res = await deps.apply({ insert: plan.toInsert, update: plan.toUpdate, close: plan.toClose, closedAt: started.toISOString() });
      run.inserted = res.inserted;
      run.updated = res.updated;
      run.closed = res.closed;
      // Every write run asks for the chunks: idempotent, and it also picks up a grant an earlier run left without.
      try {
        run.backfill = await deps.backfill();
      } catch (e) {
        run.status = 'error';
        run.backfill = 'failed';
        run.error = `backfill: ${errText(e)}`;
      }
    }
  } catch (e) {
    run.status = 'error';
    run.error = errText(e);
  }
  run.finished_at = deps.now().toISOString();
  try {
    await deps.recordRun(run);
  } catch (e) {
    deps.log(`[ingest] could not record the run: ${errText(e)}`);
  }
  deps.log(`[ingest] ${run.status} inserted=${run.inserted} updated=${run.updated} closed=${run.closed}${run.error ? ` error=${run.error}` : ''}`);
  return run;
}

/** Constant-time comparison of the scheduler bearer (same rule as scheduled-grant-scan). */
export function secureCompare(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let mismatch = x.length ^ y.length;
  const max = Math.max(x.length, y.length);
  for (let i = 0; i < max; i++) mismatch |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return mismatch === 0;
}
