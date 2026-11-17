// Péter's test 2026-11-07: a loan was nowhere called a loan, only its title gave it away. grants.grant_type is free
// text from the ingest; live on 2026-11-07: "Vissza nem térítendő támogatás (VNT)", "Vissza nem térítendő és hitel",
// "Pénzügyi eszköz– hitel", "hitel", "Pénzügyi eszköz – kockázati tőke".
// The patterns are those of supabase/functions/_shared/grant-kind.ts, with one difference on purpose: the generators
// fall back to 'grant' for unknown text, the label must not, so unknown text gets no label at all.

export type GrantKind = 'grant' | 'loan' | 'equity' | 'mixed';

const GRANT = /vissza\s*nem\s*térítendő|\bvnt\b|támogatás/i;
const LOAN = /hitel|kölcsön/i;
const EQUITY = /kockázati\s*tőke|tőkebefektetés|tőkeprogram/i;

const PART_NAMES = ['támogatás', 'hitel', 'kockázati tőke'];

const KIND_LABEL: Record<GrantKind, string> = {
  grant: 'Támogatás',
  loan: 'Hitel',
  equity: 'Kockázati tőke',
  mixed: 'Vegyes',
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
  const text = (grantType ?? '').trim();
  const parts = [GRANT.test(text), LOAN.test(text), EQUITY.test(text)];
  const count = parts.filter(Boolean).length;
  if (count === 0) return null;
  if (count > 1) {
    const named = PART_NAMES.filter((_, i) => parts[i]).join(' és ');
    return { kind: 'mixed', label: KIND_LABEL.mixed, detail: `${KIND_LABEL.mixed}: ${named}` };
  }
  const kind: GrantKind = parts[0] ? 'grant' : parts[1] ? 'loan' : 'equity';
  return { kind, label: KIND_LABEL[kind], detail: KIND_LABEL[kind] };
}
