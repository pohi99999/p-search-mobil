// Péter's test 2026-11-07: a loan was nowhere called a loan, only its title gave it away. grants.grant_type is free
// text from the ingest; live on 2026-11-07: "Vissza nem térítendő támogatás (VNT)", "Vissza nem térítendő és hitel",
// "Pénzügyi eszköz– hitel", "hitel", "Pénzügyi eszköz – kockázati tőke".
// The patterns are those of supabase/functions/_shared/grant-kind.ts, with one difference on purpose: the generators
// fall back to 'grant' for unknown text, the label must not, so unknown text gets no label at all.
//
// Round 11-21 (Ellenőr J1-J3 after #263, card dc1b408e):
// - Live on 2026-11-21 the source (ginapp-api.fair.gov.hu, 54 active tenders) has exactly four spellings:
//   "Vissza nem térítendő támogatás (VNT)" 33, "Pénzügyi eszköz– hitel" 15, "Pénzügyi eszköz – kockázati tőke" 5,
//   "Vissza nem térítendő és hitel" 1. All four had the right label already.
// - J1: a "visszatérítendő támogatás" (repayable, one word) was labelled "Támogatás", as if it were not repaid. It gets
//   its own label now. "Vissza nem térítendő" is three words, so it never contains "visszatérítendő".
// - J2, decided, not changed: grant + venture capital is "Vegyes" here, while the document generators' grant-kind.ts
//   says 'equity' for it (their material follows the capital part). The label names both parts, which is what the
//   user needs to see; the generators are server code and out of this round.

export type GrantKind = 'grant' | 'loan' | 'equity' | 'mixed' | 'repayable';

const GRANT = /vissza\s*nem\s*térítendő|\bvnt\b|támogatás/i;
const NON_REPAYABLE = /vissza\s*nem\s*térítendő|\bvnt\b/i;
const REPAYABLE = /visszatérítendő/i;
// Ellenőr #270 H2: "nem visszatérítendő" is the non-repayable grant written with the negation first; it is read as
// "vissza nem térítendő" before the patterns run, so REPAYABLE never matches it.
const NEGATED_REPAYABLE = /nem\s+visszatérítendő/gi;
const LOAN = /hitel|kölcsön/i;
const EQUITY = /kockázati\s*tőke|tőkebefektetés|tőkeprogram/i;

const PART_NAMES = ['támogatás', 'hitel', 'kockázati tőke', 'visszatérítendő támogatás'];

const KIND_LABEL: Record<GrantKind, string> = {
  grant: 'Támogatás',
  loan: 'Hitel',
  equity: 'Kockázati tőke',
  mixed: 'Vegyes',
  repayable: 'Visszatérítendő',
};

export interface GrantKindLabel {
  kind: GrantKind;
  /** The short word on the list card. */
  label: string;
  /** The detail view's text: for a mixed offer it names the parts. */
  detail: string;
}

/** The kind behind the free text, or null when the text is empty or says nothing we recognise. */
export function grantKindLabel(grantType: string | null | undefined): GrantKindLabel | null {
  const text = (grantType ?? '').trim().replace(NEGATED_REPAYABLE, 'vissza nem térítendő');
  const repayable = REPAYABLE.test(text);
  const loan = LOAN.test(text);
  // J1: the "támogatás" of a repayable support is not a non-repayable grant; only an explicit non-repayable part is.
  const grantPart = NON_REPAYABLE.test(text) || (!repayable && GRANT.test(text));
  // A repayable loan is a loan; a repayable support without a loan is its own part (Ellenőr #270 H1: with a
  // non-repayable part it is mixed, not "Támogatás").
  const repayablePart = repayable && !loan;
  const parts = [grantPart, loan, EQUITY.test(text), repayablePart];
  const count = parts.filter(Boolean).length;
  if (count === 0) return null;
  if (count > 1) {
    const named = PART_NAMES.filter((_, i) => parts[i]).join(' és ');
    return { kind: 'mixed', label: KIND_LABEL.mixed, detail: `${KIND_LABEL.mixed}: ${named}` };
  }
  if (repayablePart) return { kind: 'repayable', label: KIND_LABEL.repayable, detail: 'Visszatérítendő támogatás' };
  const kind: GrantKind = parts[0] ? 'grant' : parts[1] ? 'loan' : 'equity';
  return { kind, label: KIND_LABEL[kind], detail: KIND_LABEL[kind] };
}
