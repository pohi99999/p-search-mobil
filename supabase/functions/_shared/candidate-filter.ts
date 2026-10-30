// Which open grants may reach the scoring at all (P-Search kör 2, Irisz P1-0, card 44b0134a). The 12 scoring places
// were taken by calls no SME can apply to: about 15 open grants whose ONLY beneficiary is "Non-profit szervezet
// államháztartáson belül" (KEHOP, HAVE, BBA, IKOP), and the technical-assistance / HVSZ / intermediaries' cost
// frames (a 1 Ft minimum and billions as maximum). Every place such a row takes is a real SME match not scored.
// eligibility_criteria is the source's beneficiary list joined with ", " (scripts/ingest-grants/mapTender.ts:85).
// Plain TypeScript, no Deno API.

export interface CandidateFields {
  title?: string | null;
  eligibility_criteria?: string | null;
}

/** Beneficiaries inside the state budget: a public body, not a company. */
const PUBLIC_BENEFICIARY_RE = /államháztartáson\s+belül|költségvetési\s+szerv/i;

/** Frames that pay the programme's own operation, not a beneficiary's project. */
const TECHNICAL_TITLE_RE = /technikai\s+(?:segítségnyújtás|felhasználás)|\bHVSZ\b|közvetítő\w*\s+költségtérítés/i;

export type CandidateVerdict = { keep: true } | { keep: false; reason: 'public_only' | 'technical_frame' };

/**
 * keep unless every listed beneficiary is a public body inside the state budget, or the title names a
 * technical-assistance / HVSZ / intermediaries' cost frame. A grant with no beneficiary list is kept (no data,
 * no exclusion); one public beneficiary next to a company type is kept too.
 */
export function candidateVerdict(g: CandidateFields): CandidateVerdict {
  if (TECHNICAL_TITLE_RE.test(String(g.title ?? ''))) return { keep: false, reason: 'technical_frame' };
  const items = String(g.eligibility_criteria ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (items.length && items.every((x) => PUBLIC_BENEFICIARY_RE.test(x))) return { keep: false, reason: 'public_only' };
  return { keep: true };
}

export function isSmeCandidate(g: CandidateFields): boolean {
  return candidateVerdict(g).keep;
}
