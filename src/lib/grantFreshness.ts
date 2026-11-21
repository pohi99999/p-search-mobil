// P-Search round 11-21 (#4): the list says how fresh the grant data is. Until 11-21 the daily load had stood for four
// weeks (last new grant 10-25) and nothing on the screen showed it. No migration: grant_ingest_runs is not readable
// by clients, so the time is the grants' own latest change (updated_at follows every insert, deadline change and
// closing, trigger on public.grants), and the count uses the matching's open rule (_shared/matching.ts).
import { supabase } from './supabase';
import type { GrantFreshness } from './homeStatusText';

export type { GrantFreshness } from './homeStatusText';

/** Start of today on the device: a grant stays open through its deadline's own day (matchStatus.isOpenGrant). */
function startOfToday(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

/** Reads the freshness; null when either read fails (then the line is not shown, it never shows a guess). */
export async function fetchGrantFreshness(now: Date = new Date()): Promise<GrantFreshness | null> {
  try {
    const [latest, open] = await Promise.all([
      supabase.from('grants').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase
        .from('grants')
        .select('id', { count: 'exact', head: true })
        .or(`deadline.is.null,deadline.gte.${startOfToday(now)}`)
        .is('source_closed_at', null),
    ]);
    if (latest.error || open.error) return null;
    const updatedAt = (latest.data as { updated_at?: string | null } | null)?.updated_at;
    if (!updatedAt || Number.isNaN(new Date(updatedAt).getTime()) || typeof open.count !== 'number') return null;
    return { updatedAt, openCount: open.count };
  } catch {
    return null;
  }
}
