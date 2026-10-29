// Which business profile the Copilot chat (chat-with-gemini) reads (Brunella 4939, Lumen's live chat 4937).
// Measured live 2026-10-25 15:20Z: the account had a filled profile, yet the request carried
// business_profile_id: null next to a match id, so the prompt got no company data and asked for revenue and
// headcount. The app's profile context fetched at sign-in, before onboarding inserted the row, and kept the null.
// The client is fixed too, but installed builds (vc 18, vc 19) still send null; so when the id is missing and a
// match is discussed, the match's own business_id is used. The caller still checks that the profile is the
// caller's; one taken from the match is then skipped, not answered with 403 (card 111f80fc). A foreign match id
// itself is refused earlier, before the cap is consumed (_shared/match-ownership.ts matchOwnership).
// Plain TypeScript, no Deno API.

export type ChatProfileSource = 'request' | 'match';

/** The profile id to look up and where it came from, or null when there is none. */
export function chatProfileId(
  requested: string | null | undefined,
  matchBusinessId: string | null | undefined,
): { id: string; source: ChatProfileSource } | null {
  if (typeof requested === 'string' && requested.trim() !== '') return { id: requested, source: 'request' };
  if (typeof matchBusinessId === 'string' && matchBusinessId.trim() !== '') return { id: matchBusinessId, source: 'match' };
  return null;
}

/**
 * What to do with the looked-up profile row: use it, refuse the request (a foreign id the client sent), or go on
 * without company data (no row, or a foreign profile taken from the match).
 */
export function chatProfileDecision(
  source: ChatProfileSource,
  profileUserId: string | null | undefined,
  callerId: string,
): 'use' | 'forbidden' | 'skip' {
  if (profileUserId === callerId) return 'use';
  if (profileUserId === null || profileUserId === undefined) return 'skip';
  return source === 'request' ? 'forbidden' : 'skip';
}
