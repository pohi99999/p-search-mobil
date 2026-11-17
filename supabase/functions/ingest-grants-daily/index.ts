/**
 * Daily grant ingest (Marveen 7326, Péter GO 15383), called by pg_cron (migration 20261113120000), not by users.
 *
 * Auth: the scheduler secret (SCHEDULER_SECRET, the same one scheduled-grant-scan uses), compared in constant time.
 * Without the secret configured it refuses to run (fail closed).
 * Body: {} runs and writes; {"dry_run": true} fetches and plans, writes nothing to grants, and records a dry_run row.
 * The run itself is _shared/grant-ingest/runIngest.ts (unit-tested); this file only wires the real I/O.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchActiveTenders, type TendersPage } from '../_shared/grant-ingest/fetchTenders.ts';
import type { ExistingGrant } from '../_shared/grant-ingest/mapTender.ts';
import { runIngest, secureCompare } from '../_shared/grant-ingest/runIngest.ts';

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const expected = Deno.env.get('SCHEDULER_SECRET');
  if (!expected) {
    console.error('SCHEDULER_SECRET nincs beállítva, a futás megtagadva.');
    return json({ error: 'not configured' }, 503);
  }
  const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!secureCompare(presented, expected)) return json({ error: 'unauthorized' }, 401);

  let body: { dry_run?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const dryRun = body.dry_run === true;

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'not configured' }, 503);
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  const run = await runIngest({
    readExisting: async () => {
      const rows: ExistingGrant[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('grants').select('source_url, deadline, source_closed_at').range(from, from + 999);
        if (error) throw new Error(`grants read: ${error.message}`);
        for (const r of (data ?? []) as ExistingGrant[]) if (r.source_url) rows.push(r);
        if (!data || data.length < 1000) break;
      }
      return rows;
    },
    fetchTenders: () => fetchActiveTenders({
      fetchImpl: async (u, init) => {
        const res = await fetch(u, { ...init, signal: AbortSignal.timeout(30_000) });
        return { ok: res.ok, status: res.status, json: () => res.json() as Promise<TendersPage> };
      },
    }),
    apply: async (p) => {
      const { data, error } = await sb.rpc('ingest_grants_apply', { p_insert: p.insert, p_update: p.update, p_close: p.close, p_closed_at: p.closedAt });
      if (error) throw new Error(`ingest_grants_apply: ${error.message}`);
      const r = data as { inserted: number; updated: number; closed: number };
      return { inserted: r.inserted ?? 0, updated: r.updated ?? 0, closed: r.closed ?? 0 };
    },
    backfill: async () => {
      const res = await fetch(`${url}/functions/v1/backfill-grant-chunks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ dry_run: false }),
        signal: AbortSignal.timeout(110_000),
      });
      const text = (await res.text()).slice(0, 300);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
      return `HTTP ${res.status}: ${text}`;
    },
    recordRun: async (r) => {
      const { error } = await sb.from('grant_ingest_runs').insert(r);
      if (error) throw new Error(error.message);
    },
    now: () => new Date(),
    log: (line) => console.log(line),
  }, { dryRun });

  return json(run, run.status === 'error' ? 500 : 200);
});
