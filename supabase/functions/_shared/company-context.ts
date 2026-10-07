// What the generation prompts get about the company and the grant (card 431a496e, common test 2026-10-07).
// Péter's profile had only the company name, and the prompt said "TEÁOR kód (iparág): Nincs megadva" (the
// action plan: "Árbevétel: Ismeretlen Ft"), so the model wrote "Mivel a cég TEÁOR kódja nincs megadva,
// feltételezzük..." into a document meant to be submitted. Only the filled fields reach the prompt now,
// the prompt says not to name missing data, and mentionsMissingData lets the caller check the answer.

export interface CompanyFields {
  company_name?: string | null;
  industry_code?: string | null;
  employee_count?: number | null;
  yearly_revenue?: number | null;
  goals?: string | null;
}

export interface GrantFields {
  title?: string | null;
  provider?: string | null;
  amount_min?: number | null;
  amount_max?: number | null;
  eligibility_criteria?: string | null;
  description?: string | null;
}

/** 250000000 -> "250 000 000" (plain spaces, the same on every runtime). */
export function groupThousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const filled = (v: unknown): boolean => v !== null && v !== undefined && String(v).trim() !== "";

/** One "Label: value" line per FILLED field; an empty field leaves no line at all. */
export function companyContext(p: CompanyFields): string {
  const lines: string[] = [`Cégnév: ${p.company_name?.trim() || "a cég"}`];
  if (filled(p.industry_code)) lines.push(`TEÁOR kód (iparág): ${String(p.industry_code).trim()}`);
  if (filled(p.employee_count) && Number(p.employee_count) > 0) lines.push(`Alkalmazottak száma: ${p.employee_count} fő`);
  if (filled(p.yearly_revenue) && Number(p.yearly_revenue) > 0) lines.push(`Éves árbevétel: ${groupThousands(Number(p.yearly_revenue))} Ft`);
  if (filled(p.goals)) lines.push(`Cég céljai: ${String(p.goals).trim()}`);
  return lines.join("\n");
}

export function grantContext(g: GrantFields | null | undefined): string {
  const lines: string[] = [`Pályázat címe: ${g?.title?.trim() || "Kiválasztott pályázat"}`];
  if (filled(g?.provider)) lines.push(`Kiíró: ${String(g!.provider).trim()}`);
  const min = Number(g?.amount_min) > 0 ? groupThousands(Number(g!.amount_min)) : null;
  const max = Number(g?.amount_max) > 0 ? groupThousands(Number(g!.amount_max)) : null;
  if (min && max) lines.push(`Támogatás összege: ${min} - ${max} Ft`);
  else if (min) lines.push(`Támogatás összege: legalább ${min} Ft`);
  else if (max) lines.push(`Támogatás összege: legfeljebb ${max} Ft`);
  if (filled(g?.eligibility_criteria)) lines.push(`Kritériumok: ${String(g!.eligibility_criteria).trim()}`);
  if (filled(g?.description)) lines.push(`Pályázat leírása: ${String(g!.description).trim()}`);
  return lines.join("\n");
}

export const NO_MISSING_DATA_RULE = `FONTOS: a szöveg egy beadható dokumentum része. Csak a fent megadott adatokra építs.
Ha egy adat (például TEÁOR kód, árbevétel, létszám, cél) nem szerepel fent, NE említsd, hogy hiányzik:
ne írj olyat, hogy "nincs megadva", "ismeretlen", "feltételezzük" vagy "feltételezve", és ne találj ki számot.
Ilyenkor fogalmazz általánosan, a meglévő adatokból kiindulva.`;

/** The phrases the 2026-10-07 PDF contained; a hit means the answer talks about missing data. */
const MISSING_DATA = /nincs\s+megadva|nem\s+(?:lett|volt)\s+megadva|ismeretlen|feltételez/i;
export function mentionsMissingData(text: string): boolean {
  return MISSING_DATA.test(text);
}
