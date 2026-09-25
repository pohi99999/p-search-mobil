/**
 * Grant -> chunk texts, the SAME rule ingest-n8n-grants uses (split on blank
 * lines, trim, drop empties), applied to the WHOLE grant record instead of the
 * description alone. Measured 2026-09-25 on the live db: 62 of 63 grants had no
 * chunk at all (they came in through scripts/ingest-grants, which never
 * chunked), so match_grant_chunks could only ever find one grant.
 */
export interface GrantTextRow {
  id: string;
  title?: string | null;
  provider?: string | null;
  grant_type?: string | null;
  amount_min?: number | null;
  amount_max?: number | null;
  deadline?: string | null;
  description?: string | null;
  eligibility_criteria?: string | null;
}

/** One header paragraph (title, provider, type, amounts, deadline) + the free text fields. */
export function buildGrantText(g: GrantTextRow): string {
  const head: string[] = [];
  if (g.title) head.push(String(g.title).trim());
  const meta: string[] = [];
  if (g.provider) meta.push(`Kiíró: ${g.provider}`);
  if (g.grant_type) meta.push(`Típus: ${g.grant_type}`);
  if (g.amount_min != null || g.amount_max != null) {
    meta.push(`Összeg: ${g.amount_min ?? "?"} - ${g.amount_max ?? "?"} Ft`);
  }
  if (g.deadline) meta.push(`Határidő: ${g.deadline}`);
  if (meta.length) head.push(meta.join(". "));
  const parts = [head.join("\n"), g.description ?? "", g.eligibility_criteria ? `Jogosultság: ${g.eligibility_criteria}` : ""];
  return parts.map((p) => p.trim()).filter((p) => p.length > 0).join("\n\n");
}

/** Blank-line paragraphs, trimmed, non-empty -- identical to ingest-n8n-grants. */
export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
}

export function chunkGrant(g: GrantTextRow): string[] {
  return splitParagraphs(buildGrantText(g));
}
