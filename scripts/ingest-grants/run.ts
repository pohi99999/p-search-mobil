/**
 * Grant-ingest, by hand (P-Search step 1, card 411f445f). The daily run is the ingest-grants-daily Edge Function
 * (pg_cron, Marveen 7326); both run the same code, supabase/functions/_shared/grant-ingest/runIngest.ts, and the
 * same atomic write, public.ingest_grants_apply (ON CONFLICT (source_url) DO NOTHING, migration 20261113120000).
 *
 * DEFAULT IS DRY-RUN: it fetches, reads the DB and reports what it WOULD write,
 * but performs no writes. Pass --write to perform the authorized live load
 * (owner approved "1. LEPES palyazat-betoltes"). Never fabricates data; unset
 * amounts and unparseable deadlines are null (see mapTender.ts).
 *
 * Run: node scripts/ingest-grants/run.ts [--write] [--kkv-only]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fetchActiveTenders, type TendersPage } from '../../supabase/functions/_shared/grant-ingest/fetchTenders.ts';
import type { ExistingGrant } from '../../supabase/functions/_shared/grant-ingest/mapTender.ts';
import { runIngest } from '../../supabase/functions/_shared/grant-ingest/runIngest.ts';

function loadDotEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch { /* best effort */ }
}

async function main() {
  const write = process.argv.includes('--write');
  const kkvOnly = process.argv.includes('--kkv-only');
  loadDotEnv();
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  console.log(`[ingest] mode=${write ? 'WRITE' : 'DRY-RUN'} kkvOnly=${kkvOnly}`);

  const run = await runIngest({
    readExisting: async () => {
      const rows: ExistingGrant[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('grants').select('source_url, deadline, source_closed_at').range(from, from + 999);
        if (error) throw new Error(`select grants: ${error.message}`);
        for (const r of (data ?? []) as ExistingGrant[]) if (r.source_url) rows.push(r);
        if (!data || data.length < 1000) break;
      }
      return rows;
    },
    fetchTenders: () => fetchActiveTenders({
      fetchImpl: async (u, init) => {
        const res = await fetch(u, init);
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
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ dry_run: false }),
      });
      const text = (await res.text()).slice(0, 300);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
      return `HTTP ${res.status}: ${text}`;
    },
    // A dry run here writes nothing at all, not even the run log (the Edge Function's dry run does log it).
    recordRun: async (r) => {
      if (!write) return;
      const { error } = await sb.from('grant_ingest_runs').insert(r);
      if (error) throw new Error(error.message);
    },
    now: () => new Date(),
    log: (line) => console.log(line),
  }, { dryRun: !write, kkvOnly });

  if (!write) console.log('[ingest] DRY-RUN: no writes to grants. Re-run with --write to load.');
  if (run.status === 'error') process.exit(1);
}

main().catch((e) => { console.error('[ingest] FAILED:', e.message); process.exit(1); });
