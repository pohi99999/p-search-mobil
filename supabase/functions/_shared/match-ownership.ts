/**
 * Ownership checks for grant_matches rows handed to generate-action-plan and chat-with-gemini.
 *
 * The grant_matches table keys its owner as `business_id` (migration
 * 20260817120000_scheduling_and_matching.sql), NOT `business_profile_id`.
 * Comparing the wrong field made every match look foreign (undefined !== id)
 * and produced a 403 for the owner's own matches (owner live test 2026-09-25).
 */
export interface MatchOwnerRow {
  id?: string | null;
  business_id?: string | null;
}

/** Returns the ids of the matches that do not belong to `businessProfileId`. */
export function foreignMatchIds(
  matches: ReadonlyArray<MatchOwnerRow>,
  businessProfileId: string,
): string[] {
  return matches
    .filter((m) => !m || typeof m.business_id !== 'string' || m.business_id !== businessProfileId)
    .map((m) => (m?.id ?? '<missing id>'));
}

// deno-lint-ignore no-explicit-any
type QueryClient = { from: (table: string) => any };

export type MatchOwnership =
  | { status: 'own'; businessId: string }
  | { status: 'foreign' }
  | { status: 'missing' }
  | { status: 'error' };

/**
 * Whether the grant_matches row `matchId` belongs to `userId`, for callers that read it with the service role
 * (chat-with-gemini). grant_matches has no user_id: the owner is business_id -> business_profiles.user_id, so the
 * match's profile must be one of the caller's. A failed lookup is 'error', never 'own'.
 */
export async function matchOwnership(client: QueryClient, matchId: string, userId: string): Promise<MatchOwnership> {
  const { data: match, error: matchError } = await client
    .from('grant_matches')
    .select('business_id')
    .eq('id', matchId)
    .maybeSingle();
  if (matchError) {
    console.warn('Nem sikerült lekérni a találat profilját:', matchError);
    return { status: 'error' };
  }
  if (!match) return { status: 'missing' };
  if (typeof match.business_id !== 'string' || match.business_id === '') return { status: 'foreign' };

  const { data: profile, error: profileError } = await client
    .from('business_profiles')
    .select('id')
    .eq('id', match.business_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (profileError) {
    console.warn('Nem sikerült ellenőrizni a találat tulajdonosát:', profileError);
    return { status: 'error' };
  }
  return profile ? { status: 'own', businessId: match.business_id } : { status: 'foreign' };
}
