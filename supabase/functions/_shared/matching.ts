/**
 * Grant matching engine.
 *
 * This module is the missing core of the product. Prior to it, `grant_matches`
 * was never written to by anything in the system (verified: 0 rows in
 * production), so every user's home screen stayed permanently empty no matter
 * how many grants were ingested.
 *
 * The same logic backs both entry points:
 *   - `match-grants`         — user-initiated ("Új AI Keresés")
 *   - `scheduled-grant-scan` — the recurring per-user agent (daily/weekly)
 *
 * Matching is a two-stage funnel:
 *   1. Cheap, deterministic retrieval — a pgvector similarity search over
 *      `grant_chunks`, widened with recently published grants so that a grant
 *      whose text has not been chunked yet can still be considered.
 *   2. A single batched Gemini call that scores the shortlisted grants against
 *      the company profile. Batching keeps the run to one LLM request instead
 *      of one per grant, which matters because this runs for every user on a
 *      schedule and the project is on free-tier API quota.
 */

import { generateEmbedding, parseJsonFromModel } from './gemini.ts';
import { generateText } from './llm.ts';
import { formatAmountHu, formatDeadlineHu } from './grant-text.ts';

/** Minimal shape of the Supabase client methods this module relies on. */
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface BusinessProfileRow {
  id: string;
  company_name: string | null;
  industry_code: string | null;
  employee_count: number | null;
  yearly_revenue: number | null;
  net_revenue: number | null;
  ebitda: number | null;
  equity: number | null;
  goals: string | null;
}

export interface GrantRow {
  id: string;
  title: string;
  description: string | null;
  provider: string | null;
  grant_type: string | null;
  amount_min: number | null;
  amount_max: number | null;
  deadline: string | null;
  eligibility_criteria: string | null;
}

export interface MatchResult {
  grant_id: string;
  match_score: number;
  match_reasoning: string;
}

export interface MatchRunSummary {
  candidates: number;
  scored: number;
  inserted: number;
  skippedLowScore: number;
}

/** Matches scoring below this are not worth showing to the user. */
export const MIN_MATCH_SCORE = 40;

/** Upper bound on grants sent to the model in one scoring request. */
const MAX_CANDIDATES = 12;

/**
 * Card [C] (review 2026-10-25): the earliest deadline that still counts as open. A grant stays a candidate for its
 * whole deadline day in Budapest (the deadline is often stored as that day's midnight), the same cut the app uses.
 */
export function openGrantCutoffIso(now: Date = new Date(), timeZone = 'Europe/Budapest'): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = wall - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offsetMs).toISOString();
}

/**
 * Renders the company profile as the text that gets embedded and shown to the
 * scoring model. Missing fields are labelled rather than omitted so the model
 * can explicitly reason about gaps in the profile.
 */
export function buildProfileText(profile: BusinessProfileRow): string {
  const fmt = (n: number | null, suffix = ' Ft') =>
    n === null || n === undefined ? 'Nincs megadva' : `${n.toLocaleString('hu-HU')}${suffix}`;

  return [
    `Cégnév: ${profile.company_name ?? 'Nincs megadva'}`,
    `Főtevékenység (TEÁOR): ${profile.industry_code ?? 'Nincs megadva'}`,
    `Alkalmazottak száma: ${profile.employee_count ?? 'Nincs megadva'}`,
    `Éves árbevétel: ${fmt(profile.yearly_revenue)}`,
    `Nettó árbevétel (mérlegből): ${fmt(profile.net_revenue)}`,
    `EBITDA: ${fmt(profile.ebitda)}`,
    `Saját tőke: ${fmt(profile.equity)}`,
    `Fejlesztési célok: ${profile.goals ?? 'Nincs megadva'}`,
  ].join('\n');
}

/**
 * Collects grants worth scoring for this company.
 *
 * Semantic hits come first (ordered by similarity), then any other still-open
 * grant is appended as a fallback. The fallback matters on a young database:
 * with only a handful of grants ingested, a strict similarity threshold would
 * return nothing and the user would again see an empty screen.
 */
export async function collectCandidateGrants(
  supabase: SupabaseClient,
  profileText: string,
  geminiApiKey: string,
  embed: (text: string, apiKey: string) => Promise<number[]> = generateEmbedding,
): Promise<GrantRow[]> {
  const nowIso = openGrantCutoffIso();
  const orderedIds: string[] = [];

  try {
    const embedding = await embed(profileText, geminiApiKey);
    const { data: chunks, error } = await supabase.rpc('match_grant_chunks', {
      query_embedding: embedding,
      match_threshold: 0.2,
      match_count: 40,
    });

    if (error) {
      console.warn('match_grant_chunks RPC hiba, folytatás fallback ággal:', error.message);
    } else if (Array.isArray(chunks)) {
      for (const chunk of chunks) {
        if (chunk?.grant_id && !orderedIds.includes(chunk.grant_id)) {
          orderedIds.push(chunk.grant_id);
        }
      }
    }
  } catch (err) {
    // Embedding failure must not abort the run — the fallback path below can
    // still surface relevant grants using the deadline ordering alone.
    console.warn('Embedding alapú keresés sikertelen, fallback ág következik:', err);
  }

  // Only grants that are still open are ever considered: not past their deadline, and not closed at the source
  // (source_closed_at, card [H2]). The semantic hits are fetched by id: reading them
  // only out of the newest 60 open grants dropped every older relevant one once there were more than 60
  // (review 2026-10-25, Irisz). The newest 60 stay as the fallback order behind them.
  const columns = 'id, title, description, provider, grant_type, amount_min, amount_max, deadline, eligibility_criteria';
  const openFilter = `deadline.is.null,deadline.gte.${nowIso}`;
  const [semantic, recent] = await Promise.all([
    orderedIds.length
      ? supabase.from('grants').select(columns).in('id', orderedIds).or(openFilter).is('source_closed_at', null)
      : Promise.resolve({ data: [] as GrantRow[], error: null }),
    supabase.from('grants').select(columns).or(openFilter).is('source_closed_at', null).order('created_at', { ascending: false }).limit(60),
  ]);

  const grantsError = semantic.error ?? recent.error;
  if (grantsError) {
    throw new Error(`Nem sikerült lekérdezni a pályázatokat: ${grantsError.message}`);
  }

  const byId = new Map<string, GrantRow>();
  for (const grant of [...(semantic.data ?? []), ...(recent.data ?? [])] as GrantRow[]) {
    byId.set(grant.id, grant);
  }

  // Semantic order first, then everything else that is still open.
  const ranked: GrantRow[] = [];
  for (const id of orderedIds) {
    const grant = byId.get(id);
    if (grant) {
      ranked.push(grant);
      byId.delete(id);
    }
  }
  for (const grant of byId.values()) {
    ranked.push(grant);
  }

  return ranked.slice(0, MAX_CANDIDATES);
}

/**
 * Scores the shortlisted grants against the profile in one Gemini call.
 */
export async function scoreCandidates(
  profileText: string,
  candidates: GrantRow[],
  geminiApiKey: string,
): Promise<MatchResult[]> {
  if (candidates.length === 0) return [];

  const grantList = candidates
    .map((g, i) =>
      [
        `--- PÁLYÁZAT ${i + 1} ---`,
        `id: ${g.id}`,
        `Cím: ${g.title}`,
        `Kiíró: ${g.provider ?? 'Nincs megadva'}`,
        `Típus: ${g.grant_type ?? 'Nincs megadva'}`,
        // Copilot card: the app's amount and deadline rules, not the raw values (grant-text.ts).
        `Támogatás: ${formatAmountHu(g.amount_min, g.amount_max) ?? 'Nincs megadva'}`,
        `Határidő: ${formatDeadlineHu(g.deadline) ?? 'Nincs megadva'}`,
        `Jogosultsági feltételek: ${g.eligibility_criteria ?? 'Nincs megadva'}`,
        `Leírás: ${(g.description ?? 'Nincs megadva').slice(0, 1200)}`,
      ].join('\n'),
    )
    .join('\n\n');

  const prompt = `Magyar KKV-kra szakosodott pályázati szakértő vagy. Feladatod eldönteni, hogy az alábbi cég mennyire esélyes az egyes pályázatokon.

=== CÉGPROFIL ===
${profileText}

=== ELÉRHETŐ PÁLYÁZATOK ===
${grantList}

Értékeld MINDEGYIK pályázatot a cég szempontjából. Az értékelésnél vedd figyelembe:
- a cég méretét (alkalmazotti létszám, árbevétel) a jogosultsági feltételekhez képest,
- a főtevékenységet (TEÁOR) és a pályázat célcsoportját,
- a cég megadott fejlesztési céljait,
- a pénzügyi mutatókat (saját tőke, EBITDA), ha relevánsak.

Pontozás (match_score, 0-100 egész szám):
- 80-100: a cég egyértelműen jogosult és a pályázat illeszkedik a céljaihoz
- 60-79: valószínűleg jogosult, jó illeszkedés
- 40-59: bizonytalan jogosultság vagy részleges illeszkedés
- 0-39: nem jogosult vagy nem releváns

FONTOS szabályok:
- Csak a fent felsorolt pályázatokat értékeld, ne találj ki újakat.
- Az "id" mezőt pontosan másold vissza a fenti listából.
- A "match_reasoning" 1-2 tömör magyar mondat legyen, ami konkrétan a cég adataira hivatkozik.
- Ha egy adat hiányzik a cégprofilból, azt írd le kockázatként, ne feltételezz.

Válaszolj KIZÁRÓLAG egy JSON tömbbel, más szöveg nélkül, ebben a formában:
[{"grant_id":"<id>","match_score":<0-100>,"match_reasoning":"<magyar indoklás>"}]`;

  const raw = await generateText(prompt, geminiApiKey, {
    temperature: 0.2,
    responseMimeType: 'application/json',
  });

  const parsed = parseJsonFromModel<MatchResult[]>(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('A modell nem tömböt adott vissza a pontozásnál.');
  }

  const validIds = new Set(candidates.map((c) => c.id));

  // The model occasionally echoes an index or a hallucinated id; anything that
  // is not one of the ids we sent is dropped rather than written to the DB.
  return parsed
    .filter((m) => m && validIds.has(m.grant_id))
    .map((m) => ({
      grant_id: m.grant_id,
      match_score: Math.max(0, Math.min(100, Math.round(Number(m.match_score) || 0))),
      match_reasoning:
        typeof m.match_reasoning === 'string' && m.match_reasoning.trim().length > 0
          ? m.match_reasoning.trim()
          : 'Nincs részletes indoklás.',
    }));
}

/**
 * Runs the full matching pipeline for one company and persists the results.
 *
 * Requires a service-role client: it writes `grant_matches` rows on behalf of
 * the user, including during unattended scheduled runs where no user JWT
 * exists. Callers are responsible for having authorised the business profile.
 */
export async function runMatchingForProfile(
  supabase: SupabaseClient,
  businessProfileId: string,
  geminiApiKey: string,
): Promise<MatchRunSummary> {
  const { data: profile, error: profileError } = await supabase
    .from('business_profiles')
    .select(
      'id, company_name, industry_code, employee_count, yearly_revenue, net_revenue, ebitda, equity, goals',
    )
    .eq('id', businessProfileId)
    .single();

  if (profileError || !profile) {
    throw new Error(`Cégprofil nem található: ${businessProfileId}`);
  }

  const profileText = buildProfileText(profile as BusinessProfileRow);
  const candidates = await collectCandidateGrants(supabase, profileText, geminiApiKey);

  if (candidates.length === 0) {
    return { candidates: 0, scored: 0, inserted: 0, skippedLowScore: 0 };
  }

  const scored = await scoreCandidates(profileText, candidates, geminiApiKey);
  const worthShowing = scored.filter((m) => m.match_score >= MIN_MATCH_SCORE);

  let inserted = 0;
  if (worthShowing.length > 0) {
    // Upsert on (business_id, grant_id): a re-scan refreshes the score of an
    // existing match instead of creating a duplicate card on the home screen.
    // `status` is deliberately not written so a user's own 'ignored'/'applied'
    // decision survives future scans.
    const { error: upsertError } = await supabase.from('grant_matches').upsert(
      worthShowing.map((m) => ({
        business_id: businessProfileId,
        grant_id: m.grant_id,
        match_score: m.match_score,
        match_reasoning: m.match_reasoning,
      })),
      { onConflict: 'business_id,grant_id', ignoreDuplicates: false },
    );

    if (upsertError) {
      throw new Error(`Nem sikerült menteni az egyezéseket: ${upsertError.message}`);
    }
    inserted = worthShowing.length;
  }

  // Card 2428c38f: a new scan re-scores only the grants it found; the business's older 'new'
  // matches kept their reasoning from the old profile and sat in the list mixed with the fresh ones.
  // They are marked 'stale' (not deleted: an action plan may hang on them), and a stale match the
  // new scan found again goes back to 'new'. A user's own 'ignored'/'applied' rows are not touched.
  await markStaleMatches(supabase, businessProfileId, worthShowing.map((m) => m.grant_id));

  return {
    candidates: candidates.length,
    scored: scored.length,
    inserted,
    skippedLowScore: scored.length - worthShowing.length,
  };
}

/**
 * Computes the next due timestamp for a given cadence.
 * Returns null for 'manual', which removes the user from the scheduler.
 */
export function computeNextScanAt(frequency: string, from: Date = new Date()): string | null {
  if (frequency === 'daily') {
    return new Date(from.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  if (frequency === 'weekly') {
    return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

export const STALE_MATCH_STATUS = 'stale';

/** After a scan: 'new' matches of the business outside `freshGrantIds` become 'stale'; 'stale' ones inside go back to 'new'. */
export async function markStaleMatches(
  supabase: SupabaseClient,
  businessProfileId: string,
  freshGrantIds: string[],
): Promise<{ staled: number; revived: number }> {
  const idList = `(${freshGrantIds.map((id) => `"${id}"`).join(',')})`;
  let staleQuery = supabase
    .from('grant_matches')
    .update({ status: STALE_MATCH_STATUS })
    .eq('business_id', businessProfileId)
    .eq('status', 'new');
  if (freshGrantIds.length > 0) staleQuery = staleQuery.not('grant_id', 'in', idList);
  const { data: staled, error: staleError } = await staleQuery.select('id');
  if (staleError) throw new Error(`Nem sikerült a régi egyezéseket megjelölni: ${staleError.message}`);
  let revived: { id: string }[] | null = [];
  if (freshGrantIds.length > 0) {
    const { data, error: reviveError } = await supabase
      .from('grant_matches')
      .update({ status: 'new' })
      .eq('business_id', businessProfileId)
      .eq('status', STALE_MATCH_STATUS)
      .in('grant_id', freshGrantIds)
      .select('id');
    if (reviveError) throw new Error(`Nem sikerült a régi egyezéseket frissíteni: ${reviveError.message}`);
    revived = data;
  }
  return { staled: staled?.length ?? 0, revived: revived?.length ?? 0 };
}
