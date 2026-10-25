// grants.grant_type is free text from the ingest (2026-10-19: 63/63 filled, 7 spellings, e.g.
// "Vissza nem térítendő támogatás (VNT)", "Pénzügyi eszköz– hitel", "hitel",
// "Vissza nem térítendő és hitel hibrid"). The generators need the kind behind the spelling
// (card e388efe1, Péter 8603): a loan needs loan-application material, not grant-application text.

export type GrantKind = 'grant' | 'loan' | 'hybrid' | 'equity';

const GRANT = /vissza\s*nem\s*térítendő|\bvnt\b|támogatás/i;
const LOAN = /hitel|kölcsön/i;
const EQUITY = /kockázati\s*tőke|tőkebefektetés|tőkeprogram/i;

/**
 * The kind of a grant row. Both a non-refundable and a loan part make it hybrid. Empty or
 * unrecognised text falls back to 'grant', the material every document got before.
 */
export function grantKind(grantType: string | null | undefined): GrantKind {
  const t = (grantType ?? '').trim();
  const grant = GRANT.test(t), loan = LOAN.test(t);
  if (grant && loan) return 'hybrid';
  if (loan) return 'loan';
  if (EQUITY.test(t)) return 'equity';
  return 'grant';
}

/** One line for the action-plan prompt: what the next steps must cover for a loan, a hybrid or venture capital. */
export function actionPlanHint(kind: GrantKind): string {
  if (kind === 'loan') return 'A kiválasztott program visszafizetendő hitel, nem támogatás: a Következő Lépésekben a hitelkérelem előkészítése szerepeljen (pénzügyi beszámolók, a saját erő igazolása, a fedezet, a törlesztési terv), és ne nevezd támogatásnak.';
  if (kind === 'equity') return 'A kiválasztott program kockázatitőke-befektetés, nem támogatás és nem hitel: a Következő Lépésekben a befektetői anyagok előkészítése szerepeljen (pitch deck, cap table / tulajdonosi tábla, due diligence előkészítés, cégértékelés).';
  if (kind === 'hybrid') return 'A kiválasztott program kombinált (vissza nem térítendő támogatás és hitel): a Következő Lépésekben a pályázati teendők mellett a hitelrész teendői is szerepeljenek (a saját erő igazolása, a fedezet, a törlesztési terv).';
  return '';
}
