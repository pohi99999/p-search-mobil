// What the Copilot chat (chat-with-gemini) puts in front of the model (vc 18 E2E, Lumen 4800; Brunella 4802/4853).
// Measured on the 4802 code: the user's message alone was embedded and searched over EVERY grant's chunks
// (threshold 0.3), so a short question about BAY_VOUCHER brought TEN-T and geothermal chunks, and their titles
// became the "Források" chips. The prompt also never asked for tegezés while its sample reply said "meg tudná
// adni", so the model answered in magázás. Now:
// - with a match, the knowledge is the discussed grant's own chunks only, with no search over other grants;
// - without a match, the search keeps only open grants (the matching's rule: deadline from the Budapest day's
//   start, source not closed);
// - the prompt says tegezés, and its sample reply uses it.
// The similarity is no relevance signal here: measured 2026-10-25 on 5 questions (live, gemini-embedding-001),
// all 40 hits scored 0.64-0.78, the generic "Mi a határideje?" too, so no threshold separates the asked grant
// from the rest. Scoping to the grant is what removes the foreign sources, not a higher threshold.
// Profile (Lumen's evening check 4925, Brunella 4927/4930): with 5 employees and 50 M Ft in the profile, the reply
// still asked for the revenue and the headcount. The rule told the model to ask for company form, revenue,
// headcount and region whenever the data was not enough, and the profile has no company form or region column,
// so the condition always held; the sample reply asked for the revenue too. Now the rule names what the
// profile already gives (not to be asked again) and asks only for the rest.
// Plain TypeScript, no Deno API.

import { type CompanyFields } from './company-context.ts';
import { formatAmountHu, formatDeadlineHu } from './grant-text.ts';

/** The search's threshold, unchanged: 0.45 would have dropped 0 of 40 measured hits (see above). */
export const RAG_MIN_SIMILARITY = 0.3;
/** Hits asked of the RPC: more than shown, since closed grants are dropped after. */
export const RAG_MATCH_COUNT = 8;
/** At most this many chunks reach the prompt (as before). */
export const RAG_MAX_SIMILAR = 5;
/** At most this many of the discussed grant's own chunks (live: at most 5 per grant, Brunella 4853). */
export const OWN_CHUNK_LIMIT = 6;

export interface ChatGrant {
  id?: string | null;
  title?: string | null;
  provider?: string | null;
  grant_type?: string | null;
  amount_min?: number | null;
  amount_max?: number | null;
  deadline?: string | null;
  eligibility_criteria?: string | null;
  description?: string | null;
  source_closed_at?: string | null;
}

export interface RagChunk {
  grant_id: string;
  grant_title?: string | null;
  content: string;
  similarity: number;
}

/** The discussed grant for the prompt, with the deadline and amount as the app shows them. */
export function chatGrantContext(g: ChatGrant): string {
  return [
    `Pályázat címe: ${g.title || 'Nincs megadva'}`,
    `Kiíró/Szolgáltató: ${g.provider || 'Nincs megadva'}`,
    `Típus: ${g.grant_type || 'Nincs megadva'}`,
    `Támogatás: ${formatAmountHu(g.amount_min, g.amount_max) ?? 'a kiírás nem ad meg összeget'}`,
    `Beadási határidő: ${formatDeadlineHu(g.deadline) ?? 'a kiírás nem ad meg határidőt'}`,
    `Elfogadhatósági feltételek: ${g.eligibility_criteria || 'Nincs megadva'}`,
    `Leírás: ${g.description || 'Nincs megadva'}`,
  ].join('\n');
}

/** Open as the matching counts it: no deadline or one from the cutoff on (openGrantCutoffIso), and not closed at the source. */
export function isGrantOpen(g: Pick<ChatGrant, 'deadline' | 'source_closed_at'>, cutoffIso: string): boolean {
  if (g.source_closed_at) return false;
  if (!g.deadline) return true;
  const t = new Date(g.deadline).getTime();
  return Number.isNaN(t) || t >= new Date(cutoffIso).getTime();
}

/**
 * The knowledge part of the prompt and the "Források" titles.
 * - own (a match): the discussed grant's chunks and its title as the only source; the hits are not used;
 * - otherwise the vector hits of open grants, closed or unknown grants and hits under the threshold dropped.
 */
export function buildRagContext(opts: {
  own: { title: string; chunks: string[] } | null;
  hits: RagChunk[];
  grants: Map<string, ChatGrant>;
  cutoffIso: string;
}): { text: string; sources: string[]; similarCount: number } {
  const { own, hits, grants, cutoffIso } = opts;
  if (own) {
    const text = own.chunks.length > 0
      ? `A TÁRGYALT PÁLYÁZAT (${own.title}) KIÍRÁSÁNAK RÉSZLETEI:\n` + own.chunks.map((c) => `- ${c}`).join('\n')
      : '';
    return { text, sources: [own.title], similarCount: 0 };
  }

  const sources: string[] = [];
  const similar = hits
    .filter((h) => h.similarity >= RAG_MIN_SIMILARITY)
    .filter((h) => {
      const g = grants.get(h.grant_id);
      return g !== undefined && isGrantOpen(g, cutoffIso);
    })
    .slice(0, RAG_MAX_SIMILAR);

  let text = '';
  if (similar.length > 0) {
    text = 'RELEVÁNS, MÉG NYITOTT PÁLYÁZATOK RÉSZLETEI A TUDÁSBÁZISBÓL:\n' + similar.map((h) => {
      const g = grants.get(h.grant_id)!;
      const title = g.title || h.grant_title || 'Pályázat';
      const deadline = formatDeadlineHu(g.deadline);
      return `- Pályázat címe: ${title}${deadline ? ` (beadási határidő: ${deadline})` : ''}\n  Tartalom: ${h.content}`;
    }).join('\n');
    for (const h of similar) {
      const title = grants.get(h.grant_id)!.title || h.grant_title;
      if (title && !sources.includes(title)) sources.push(title);
    }
  }

  return { text, sources, similarCount: similar.length };
}

export const TEGEZES_RULE =
  '- Tegezd a felhasználót, ahogy az alkalmazás is teszi (te, neked, tudsz, add meg). Magázó alakot (Ön, Önnek, tudná, adja meg, kérem) ne használj.';

const known = (v: unknown): boolean => v !== null && v !== undefined && String(v).trim() !== '' && Number(v) > 0;

/**
 * The rule on asking back for company data. The profile stores the revenue and the headcount; the company form
 * and the region it has no column for, so those stay askable. What the profile gives is named as known.
 */
export function profileAskRule(profile: CompanyFields | null): string {
  const revenue = known(profile?.yearly_revenue);
  const headcount = known(profile?.employee_count);
  const missing = ['cégforma'];
  if (!revenue) missing.push('éves árbevétel');
  if (!headcount) missing.push('aktuális foglalkoztatotti létszám');
  missing.push('székhely/telephely régió');
  const given = [headcount && 'a foglalkoztatotti létszám', revenue && 'az éves árbevétel'].filter(Boolean);
  const list = `${missing.slice(0, -1).join(', ')} és ${missing[missing.length - 1]}`;
  let rule = `- Ha a felhasználó cégéről még nem áll rendelkezésre elegendő információ a pontos pályázati szűréshez, kérdezz vissza a hiányzó kulcsfontosságú részletekre: ${list}.`;
  if (given.length > 0) {
    // One given field takes the singular ("ezt ... használd"), two the plural ("ezeket ... használd őket").
    const tail = given.length === 1
      ? 'ezt ne kérdezd meg újra, és ne sorold fel bekérendő adatként, hanem használd.'
      : 'ezeket ne kérdezd meg újra, és ne sorold fel bekérendő adatként, hanem használd őket.';
    rule += ` A lenti cégadatok között már szerepel ${given.join(' és ')}: ${tail}`;
  }
  return rule;
}

/** The system prompt; the four context blocks are left out when empty. */
export function buildChatSystemPrompt(ctx: {
  company: string;
  grant: string;
  rag: string;
  tasks: string;
  profile?: CompanyFields | null;
}): string {
  return `Te egy Professzionális Pályázati és Digitalizációs Szakértő Copilot vagy, a P-Search AI asszisztense.
Küldetésed, hogy támogasd a magyar kis- és középvállalkozásokat (KKV-kat) a digitális átállásban, különös tekintettel az AI integrációra, szoftverfejlesztésre és hardverbeszerzésre.
Stílusod legyen lényegretörő, szakmai, de támogató.
${TEGEZES_RULE}

SZABÁLYOK A PÁLYÁZATOKKAL KAPCSOLATBAN:
- Soha ne találj ki nem létező pályázatokat! A válaszaidat alapozd a lenti hiteles forrásokra vagy az aktuálisan tárgyalt pályázat adataira.
- Ha van aktuálisan tárgyalt pályázat, a kérdésekre CSAK annak adataiból és kiírás-részleteiből válaszolj. Ha a felhasználó más pályázatot keres, mondd meg, hogy azt a főoldali kereséssel találja meg.
- A határidőt és az összeget pontosan úgy add meg, ahogy a lenti adatokban áll; ne számold át és ne kerekítsd.
${profileAskRule(ctx.profile ?? null)}
- Képes vagy a beszélgetés alapján frissíteni a cég adatait vagy lezárni a teendőket az adatbázisban.

${ctx.company ? `Aktuális ügyfél (cég) adatai:\n${ctx.company}\n` : ''}
${ctx.grant ? `Aktuálisan tárgyalt pályázat adatai:\n${ctx.grant}\n` : ''}
${ctx.rag ? `Tudásbázisból származó adatok:\n${ctx.rag}\n` : ''}
${ctx.tasks ? `Aktuális teendők listája az adatbázisban:\n${ctx.tasks}\n` : ''}

KÖTELEZŐ FORMÁTUMI UTASÍTÁSOK:
1. A válaszodat KIZÁRÓLAG egy érvényes JSON formátumban adhatod vissza az alábbi kulcsokkal:
   - "reply": A felhasználónak küldött válasz szövege (magyarul, tegezve, lényegretörő, szakmai és támogató stílusban, az átadott hiteles pályázati adatokra építve).
   - "profile_updates": Ha a beszélgetés során a felhasználó egyértelműen új vagy pontosabb cégadatot adott meg (pl. az árbevételt vagy az alkalmazottak számát), akkor töltsd ki ezt az objektumot a megfelelő értékekkel (kulcsok: "revenue" (szám), "employee_count" (szám)). Ha nem volt új adat, hagyd el a kulcsot vagy legyen null.
   - "task_updates": Ha a felhasználó jelezte, hogy egy feladatot elvégzett (pl. "ellenőriztem a pénzügyi adatokat" vagy "megvan a nyilatkozat"), keresd meg a fenti feladatlistából a hozzá tartozó feladatot, és a "completed_task_ids" tömbbe tedd bele annak UUID azonosítóját. Ha nem volt ilyen, a tömb legyen üres vagy a kulcs null.

Példa a kimenetre:
{
  "reply": "Rögzítettem, hogy a cég már 12 fős. Szeretnéd, hogy végignézzük, mit kell előkészítened a beadásig?",
  "profile_updates": {
    "employee_count": 12
  },
  "task_updates": {
    "completed_task_ids": []
  }
}`;
}
