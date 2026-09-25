/**
 * Ownership check for grant_matches rows handed to generate-action-plan.
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
