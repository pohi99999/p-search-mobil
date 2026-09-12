/**
 * Grant-ingest orchestrator (P-Search step 1, card 411f445f).
 *
 * Wires the tested pure pieces to Supabase:
 *   fetchActiveTenders (real HTTPS) -> selectGrantsToIngest (open + undated,
 *   2-layer dedup) -> upsert into public.grants (onConflict source_url).
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
import { fetchActiveTenders, type TendersPage } from './fetchTenders.ts';
import { selectGrantsToIngest, type GrantRecord } from './mapTender.ts';

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

async function readExistingSourceUrls(sb: ReturnType<typeof createClient>): Promise<Set<string>> {
  const urls = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from('grants').select('source_url').range(from, from + pageSize - 1);
    if (error) throw new Error(`select grants: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as { source_url: string | null }[]) if (r.source_url) urls.add(r.source_url);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return urls;
}

const realFetch = async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
  const res = await fetch(url, init);
  return { ok: res.ok, status: res.status, json: () => res.json() as Promise<TendersPage> };
};

async function main() {
  const write = process.argv.includes('--write');
  const kkvOnly = process.argv.includes('--kkv-only');
  loadDotEnv();
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log(`[ingest] mode=${write ? 'WRITE' : 'DRY-RUN'} kkvOnly=${kkvOnly}`);
  const existing = await readExistingSourceUrls(sb);
  console.log(`[ingest] existing grants in DB: ${existing.size}`);

  const tenders = await fetchActiveTenders({ fetchImpl: realFetch });
  console.log(`[ingest] fetched Aktív tenders: ${tenders.length}`);

  const sel = selectGrantsToIngest(tenders, { existingSourceUrls: existing, kkvOnly });
  console.log(`[ingest] toInsert=${sel.toInsert.length} (open=${sel.openCount}, undated=${sel.undatedCount}), skippedExisting=${sel.skippedExisting}`);
  if (sel.toInsert[0]) {
    const s = sel.toInsert[0];
    console.log(`[ingest] sample: ${JSON.stringify({ title: s.title.slice(0, 60), deadline: s.deadline, amount_max: s.amount_max, source_url: s.source_url.slice(0, 70) })}`);
  }

  if (!write) {
    console.log('[ingest] DRY-RUN: no writes performed. Re-run with --write to load.');
    return;
  }

  // Plain insert: selectGrantsToIngest already dedups against existing DB
  // source_urls and within the batch, so no row here collides. We do NOT rely on
  // onConflict because the UNIQUE(source_url) constraint ships in a migration
  // (20260912140000_grants_source_url_unique.sql) that may not be applied to the
  // live DB yet. Re-running is idempotent: a second run's dedup yields toInsert=0.
  let inserted = 0;
  const batch = 500;
  for (let i = 0; i < sel.toInsert.length; i += batch) {
    const chunk = sel.toInsert.slice(i, i + batch) as GrantRecord[];
    const { data, error } = await sb.from('grants').insert(chunk).select('id');
    if (error) throw new Error(`insert batch ${i}: ${error.message}`);
    inserted += data?.length ?? 0;
  }
  const { count: total } = await sb.from('grants').select('*', { count: 'exact', head: true });
  console.log(`[ingest] WRITE done. upserted≈${inserted}. grants total now: ${total}`);
}

main().catch((e) => { console.error('[ingest] FAILED:', e.message); process.exit(1); });
