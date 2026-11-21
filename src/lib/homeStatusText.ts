// Round 11-21 (#2, #4): the texts of the status lines above the match list. Pure module, no Supabase import, so the
// component and its tests do not load the client.

export interface GrantFreshness {
  /** ISO time of the latest change in the grant list. */
  updatedAt: string;
  /** Grants still open: deadline today or later, or none given, and not closed at the source. */
  openCount: number;
}

/** "Pályázatlista frissítve: 2026. 11. 21. · 52 nyitott pályázat" */
export function freshnessLine(f: GrantFreshness): string {
  const day = new Date(f.updatedAt).toLocaleDateString('hu-HU');
  return `Pályázatlista frissítve: ${day} · ${f.openCount} nyitott pályázat`;
}

/** "3 új pályázat a legutóbbi látogatásod óta" (the synthesis' wording, SZINTEZIS.md #2) */
export function newMatchesLine(n: number): string {
  return `${n} új pályázat a legutóbbi látogatásod óta`;
}
