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
    deadline: t.endTime ?? null,
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
