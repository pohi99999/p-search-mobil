/**
 * Pure, dependency-free mapping from a palyazat.gov.hu KrakenD tender object
 * to our `grants` table shape, plus open/KKV classification and dedup.
 *
 * Source API (verified 2026-09-11): POST https://ginapp-api.fair.gov.hu/papi/tenders/list
 * Fields used here all come from that list response; see docs on the card.
 *
 * Design rules (owner decision 2026-09-11): never assert a value the source did
 * not provide. Unset amounts (the API sends 0 when not populated) map to null,
 * not a fabricated 0. Open = status "Aktív" AND deadline in the future.
 * Grants without a parseable deadline are flagged, never silently dropped.
 */

import { normalizeDeadline } from '../../supabase/functions/_shared/deadline-normalize.ts';

export interface Tender {
  id: string;
  code: string;
  name: string;
  endTime?: string | null;
  startTime?: string | null;
  status?: string | null;
  minSupportAmount?: number | null;
  maxSupportAmount?: number | null;
  formOfSupport?: string | null;
  developmentalProgram?: string | null;
  operationalProgram?: string | null;
  supportPurpose?: string | null;
  conditionsOfSupport?: string | null;
  beneficiaries?: string[] | null;
}

export interface GrantRecord {
  title: string;
  description: string | null;
  provider: string | null;
  grant_type: string | null;
  amount_min: number | null;
  amount_max: number | null;
  deadline: string | null;
  eligibility_criteria: string | null;
  source_url: string;
}

const KKV_BENEFICIARIES = ['Mikrovállalkozás', 'kisvállalkozás', 'középvállalkozás'];
const ACTIVE_STATUS = 'Aktív';

/** The API sends 0 for "not populated"; treat 0 and negatives as unknown. */
function amountOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && v > 0 ? v : null;
}

/** ISO 8601 timestamp in the future, per a supplied `now` (defaults to real now). */
export function hasFutureDeadline(t: Tender, now: Date = new Date()): boolean {
  if (!t.endTime) return false;
  const d = new Date(t.endTime);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > now.getTime();
}

export function isOpen(t: Tender, now: Date = new Date()): boolean {
  return (t.status ?? '') === ACTIVE_STATUS && hasFutureDeadline(t, now);
}

export function isKkvRelevant(t: Tender): boolean {
  const b = t.beneficiaries ?? [];
  return b.some((x) => KKV_BENEFICIARIES.includes(x));
}

/** A grant is Aktív but its deadline is missing/unparseable -> flag, don't drop. */
export function isActiveButUndated(t: Tender): boolean {
  return (t.status ?? '') === ACTIVE_STATUS && !hasFutureDeadline(t, new Date(0));
}

export function buildSourceUrl(t: Tender): string {
  const program = encodeURIComponent(t.developmentalProgram ?? '');
  const op = encodeURIComponent(t.operationalProgram ?? '');
  const code = encodeURIComponent(t.code);
  return `https://www.palyazat.gov.hu/palyazatok/redirect?program=${program}&op=${op}&code=${code}`;
}

export function mapTenderToGrant(t: Tender): GrantRecord {
  const provider = [t.developmentalProgram, t.operationalProgram].filter(Boolean).join(' / ') || null;
  const description = [t.supportPurpose, t.conditionsOfSupport].filter(Boolean).join('\n\n') || null;
  const eligibility = (t.beneficiaries ?? []).length ? (t.beneficiaries as string[]).join(', ') : null;
  return {
    title: t.name,
    description,
    provider,
    grant_type: t.formOfSupport ?? null,
    amount_min: amountOrNull(t.minSupportAmount),
    amount_max: amountOrNull(t.maxSupportAmount),
    // Card [H2]: the source's winter dates come an hour off; stored as the Budapest midnight of the last day.
    deadline: normalizeDeadline(t.endTime),
    eligibility_criteria: eligibility,
    source_url: buildSourceUrl(t),
  };
}

export interface SelectOptions {
  now?: Date;
  /** If true, only KKV-relevant grants; else all (KKV is a scored tag, default). */
  kkvOnly?: boolean;
  existingSourceUrls: ReadonlySet<string>;
}

export interface SelectResult {
  /** Everything to write to `grants` this run: open (dated, future) + undated-active. */
  toInsert: GrantRecord[];
  /** Of toInsert, how many are open (Aktiv + future deadline). This is the >=50 metric. */
  openCount: number;
  /** Of toInsert, how many are Aktiv with no usable deadline (deadline=null in the row). */
  undatedCount: number;
  /** Candidates dropped because their source_url already exists (DB or earlier in batch). */
  skippedExisting: number;
}

/**
 * Selects the grants to ingest this run: OPEN (Aktiv AND future deadline) plus
 * ACTIVE-UNDATED (Aktiv, no usable deadline). Undated rows carry deadline=null,
 * which is how the DB (and the app) tells them apart from dated ones -- they must
 * NOT be shown as expired (owner rule 2026-09-11). Aktiv-but-past-deadline calls
 * are stale and are NOT ingested. Dedups by source_url against the DB and within
 * the batch. `kkvOnly` (default false) applies to both categories when set.
 */
export function selectGrantsToIngest(tenders: Tender[], opts: SelectOptions): SelectResult {
  const now = opts.now ?? new Date();
  const kkvOk = (t: Tender) => !opts.kkvOnly || isKkvRelevant(t);
  const seen = new Set<string>();
  const toInsert: GrantRecord[] = [];
  let openCount = 0;
  let undatedCount = 0;
  let skippedExisting = 0;
  for (const t of tenders) {
    const open = isOpen(t, now);
    const undated = isActiveButUndated(t);
    if ((!open && !undated) || !kkvOk(t)) continue;
    const g = mapTenderToGrant(t);
    if (opts.existingSourceUrls.has(g.source_url) || seen.has(g.source_url)) {
      skippedExisting++;
      continue;
    }
    seen.add(g.source_url);
    toInsert.push(g);
    if (open) openCount++;
    else undatedCount++;
  }
  return { toInsert, openCount, undatedCount, skippedExisting };
}

// ---------------------------------------------------------------------------------------------------------------
// Card [H2] (review 2026-10-25, Brunella 4750): the loader only ever inserted, so a deadline the source extended
// (GINOP_PLUSZ-1.4.3-24) or a call it closed (GINOP_PLUSZ-1.2.1-21, suspended) never reached the DB. planGrantSync
// also updates the rows it loaded before. Rows are never deleted (grant_matches point at them).

const LOADER_URL_PREFIX = 'https://www.palyazat.gov.hu/palyazatok/redirect?';
/** Below this many Aktív tenders the fetch is treated as broken, and nothing is closed. */
export const MIN_ACTIVE_FOR_CLOSING = 20;

export interface ExistingGrant {
  source_url: string;
  deadline: string | null;
  source_closed_at: string | null;
}

export interface GrantUpdate {
  source_url: string;
  deadline: string | null;
  source_closed_at: null;
}

export interface SyncPlan extends SelectResult {
  /** Loaded rows whose deadline changed at the source, or that are Aktív again after being closed. */
  toUpdate: GrantUpdate[];
  /** Loaded rows no longer in the source's Aktív list: to be stamped source_closed_at. */
  toClose: string[];
  /** True when the Aktív list was too short to trust, so toClose was left empty. */
  closingSkipped: boolean;
}

/** The call code of a URL this loader built, or null for any other URL (kavosz.hu, a hand seed's page...). */
export function loaderCode(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(LOADER_URL_PREFIX)) return null;
  try {
    return new URL(url).searchParams.get('code');
  } catch {
    return null;
  }
}

const sameInstant = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && new Date(a).getTime() === new Date(b).getTime());

/**
 * What a run should write: the new open/undated calls (as selectGrantsToIngest), the deadline of every loaded row
 * that changed at the source, and the loaded rows that dropped out of the Aktív list. Rows are matched by call code.
 * `tenders` must be the source's full Aktív list (fetchActiveTenders), not a filtered subset.
 */
export function planGrantSync(tenders: Tender[], existing: ExistingGrant[], opts: { now?: Date; kkvOnly?: boolean } = {}): SyncPlan {
  const byCode = new Map<string, ExistingGrant>();
  for (const row of existing) {
    const code = loaderCode(row.source_url);
    if (code) byCode.set(code, row);
  }
  const existingUrls = new Set(existing.map((r) => r.source_url));
  const knownCodes = new Set(byCode.keys());
  const fresh = tenders.filter((t) => !knownCodes.has(t.code));
  const insert = selectGrantsToIngest(fresh, { existingSourceUrls: existingUrls, now: opts.now, kkvOnly: opts.kkvOnly });

  const toUpdate: GrantUpdate[] = [];
  const activeCodes = new Set<string>();
  for (const t of tenders) {
    if ((t.status ?? '') !== ACTIVE_STATUS) continue;
    activeCodes.add(t.code);
    const row = byCode.get(t.code);
    if (!row) continue;
    const deadline = normalizeDeadline(t.endTime);
    if (!sameInstant(row.deadline, deadline) || row.source_closed_at !== null) {
      toUpdate.push({ source_url: row.source_url, deadline, source_closed_at: null });
    }
  }

  const closingSkipped = activeCodes.size < MIN_ACTIVE_FOR_CLOSING;
  const toClose = closingSkipped
    ? []
    : [...byCode.entries()].filter(([code, row]) => !activeCodes.has(code) && row.source_closed_at === null).map(([, row]) => row.source_url);

  return { ...insert, skippedExisting: insert.skippedExisting + (tenders.length - fresh.length), toUpdate, toClose, closingSkipped };
}
