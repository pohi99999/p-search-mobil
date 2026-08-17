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

import { generateEmbedding, generateText, parseJsonFromModel } from './gemini.ts';

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
): Promise<GrantRow[]> {
  const nowIso = new Date().toISOString();
  const orderedIds: string[] = [];

  try {
    const embedding = await generateEmbedding(profileText, geminiApiKey);
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

  // Only grants that are still open are ever considered.
  const { data: openGrants, error: grantsError } = await supabase
    .from('grants')
    .select(
      'id, title, description, provider, grant_type, amount_min, amount_max, deadline, eligibility_criteria',
    )
    .or(`deadline.is.null,deadline.gte.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(60);

  if (grantsError) {
    throw new Error(`Nem sikerült lekérdezni a pályázatokat: ${grantsError.message}`);
  }

  const byId = new Map<string, GrantRow>();
  for (const grant of (openGrants ?? []) as GrantRow[]) {
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
        `Támogatás: ${g.amount_min?.toLocaleString('hu-HU') ?? '?'} - ${
          g.amount_max?.toLocaleString('hu-HU') ?? '?'
        } Ft`,
        `Határidő: ${g.deadline ?? 'Nincs megadva'}`,
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
