// The Gemini settings and the error answers of generate-document, kept apart from the request
// handler so they can be tested (card 6c7049fa #12, 2026-10-07).
import { GeminiOutputError, GeminiUnavailableError, geminiUnavailableResponse, type GeminiDeps, type GenerateOptions } from "../_shared/gemini.ts";
import { generateJson } from "../_shared/llm.ts";
import { mentionsMissingData, NO_MISSING_DATA_RULE } from "../_shared/company-context.ts";
import type { GrantKind } from "../_shared/grant-kind.ts";

// Three Hungarian sections of 150-200 words need well over 1500 tokens, and on gemini-2.5-flash the
// thinking tokens counted against the old 1500 cap too: the JSON was cut off at character 124.
// Thinking off, a cap with room to spare.
export const DOCUMENT_GENERATION: Required<Pick<GenerateOptions, "temperature" | "maxOutputTokens" | "thinkingBudget" | "responseMimeType">> = {
  temperature: 0.4,
  maxOutputTokens: 4096,
  thinkingBudget: 0,
  responseMimeType: "application/json",
};

/** The client answer for a failed generation: Gemini errors with their code and Hungarian text, anything else a generic 500. */
export function documentErrorResponse(err: unknown, headers: Record<string, string>): Response {
  if (err instanceof GeminiUnavailableError) return geminiUnavailableResponse(err, headers);
  if (err instanceof GeminiOutputError) {
    return new Response(JSON.stringify({ code: err.code, error: err.message }), {
      status: 502,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ error: "Nem sikerült legenerálni a dokumentumot." }), {
    status: 500,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export interface DocumentSections {
  executive_summary?: string;
  market_analysis?: string;
  financial_plan?: string;
}

const REMINDER = "Az előző válaszod hiányzó adatot említett (például \"nincs megadva\" vagy \"feltételezzük\"). Írd újra úgy, hogy ilyen kifejezés ne szerepeljen, és ne találj ki adatot: fogalmazz általánosan, a megadott adatokra építve.";

/**
 * The three sections. If the answer still talks about missing data ("nincs megadva", "feltételezzük";
 * card 431a496e), ONE regeneration with an explicit reminder; that second answer is used either way
 * (the check is logged when it still hits).
 */
export async function generateSections(userPrompt: string, apiKey: string, systemPrompt: string, deps?: GeminiDeps): Promise<DocumentSections> {
  const opts = { ...DOCUMENT_GENERATION, systemInstruction: systemPrompt };
  const first = await generateJson<DocumentSections>(userPrompt, apiKey, opts, deps);
  if (!mentionsMissingData(Object.values(first).join("\n"))) return first;
  console.warn("A dokumentum hiányzó adatot említett, újragenerálás emlékeztetővel.");
  const second = await generateJson<DocumentSections>(`${userPrompt}\n\n${REMINDER}`, apiKey, opts, deps);
  if (mentionsMissingData(Object.values(second).join("\n"))) console.warn("Az újragenerált dokumentum is hiányzó adatot említ.");
  return second;
}

/** What the document says and asks for, by the kind of the programme (card e388efe1). */
export interface DocumentBrief {
  title: string;
  programLabel: string;
  headings: [string, string, string];
  userPrompt: string;
  intro: string;
  dataHeader: string;
  sections: string;
}

const GRANT_BRIEF: DocumentBrief = {
  title: "Pályázati Felkészülési Üzleti Terv",
  programLabel: "Célzott Pályázat:",
  headings: ["1. Vezetői Összefoglaló", "2. Piacelemzés és Versenyelőny", "3. Pénzügyi Terv és Megtérülés"],
  userPrompt: "Kérlek, generáld le a pályázathoz illeszkedő üzleti terv vázlatot a megadott adatok alapján.",
  intro: `Te egy professzionális pályázatíró AI asszisztens vagy.
A megadott cégprofil és pályázati adatok alapján készíts el egy Üzleti Terv Vázlatot a pályázati felkészüléshez.`,
  dataHeader: "Pályázati adatok:",
  sections: `- "executive_summary": Vezetői összefoglaló, a projekt célja és a pályázati támogatás felhasználása (magyarul, kb. 150 szó).
- "market_analysis": Piacelemzés, célcsoport és versenyelőny bemutatása a TEÁOR kód és cégprofil alapján (magyarul, kb. 150-200 szó).
- "financial_plan": Pénzügyi terv vázlat, a támogatási összeg elosztása és a várható megtérülés a cégbevétele alapján (magyarul, kb. 150 szó).`,
};

// A loan is paid back: the bank reads repayment, own funds, collateral and cash flow (Péter 8603).
const LOAN_BRIEF: DocumentBrief = {
  title: "Hitelkérelem-előkészítő Üzleti Terv",
  programLabel: "Célzott Hitelprogram:",
  headings: ["1. Vezetői Összefoglaló és Hitelcél", "2. Piac és Árbevétel-stabilitás", "3. Törlesztés, Saját Erő, Fedezet és Cash-flow"],
  userPrompt: "Kérlek, generáld le a hitelprogramhoz illeszkedő hitelkérelem-előkészítő üzleti terv vázlatot a megadott adatok alapján.",
  intro: `Te egy professzionális pályázatíró és hitelkérelem-előkészítő AI asszisztens vagy.
A megadott cégprofil és hitelprogram-adatok alapján készíts el egy Hitelkérelem-előkészítő Üzleti Terv Vázlatot.
Ez visszafizetendő hitel, nem vissza nem térítendő támogatás: ne nevezd támogatásnak.`,
  dataHeader: "Hitelprogram adatai:",
  sections: `- "executive_summary": Vezetői összefoglaló és a hitel célja: mire fordítja a cég a hitelt, és ez hogyan erősíti a működését (magyarul, kb. 150 szó).
- "market_analysis": Piac és árbevétel-stabilitás: a cég piaca, vevői és bevételi forrásai, amelyek a visszafizetést megalapozzák, a TEÁOR kód és cégprofil alapján (magyarul, kb. 150-200 szó).
- "financial_plan": Finanszírozási terv: a törlesztés forrása és ütemezése a cég bevétele alapján, a szükséges saját erő, a felajánlható fedezet (biztosíték) és egy egyszerű cash-flow vázlat (magyarul, kb. 150-200 szó).`,
};

// Part grant, part loan: both, kept apart.
const HYBRID_BRIEF: DocumentBrief = {
  title: "Pályázati és Hitelkérelem-előkészítő Üzleti Terv",
  programLabel: "Célzott Program:",
  headings: ["1. Vezetői Összefoglaló", "2. Piacelemzés, Versenyelőny és Árbevétel", "3. Pénzügyi Terv: Támogatás és Hitel"],
  userPrompt: "Kérlek, generáld le a kombinált programhoz illeszkedő üzleti terv vázlatot a megadott adatok alapján.",
  intro: `Te egy professzionális pályázatíró és hitelkérelem-előkészítő AI asszisztens vagy.
A megadott cégprofil és program-adatok alapján készíts el egy Üzleti Terv Vázlatot egy kombinált programhoz:
egy része vissza nem térítendő támogatás, egy része visszafizetendő hitel. A két részt mindenhol válaszd szét.`,
  dataHeader: "Program adatai:",
  sections: `- "executive_summary": Vezetői összefoglaló, a projekt célja, és mire fordítja a cég a támogatási és a hitelrészt (magyarul, kb. 150 szó).
- "market_analysis": Piacelemzés, célcsoport, versenyelőny és árbevétel-stabilitás (ez alapozza meg a hitelrész visszafizetését is) a TEÁOR kód és cégprofil alapján (magyarul, kb. 150-200 szó).
- "financial_plan": Pénzügyi terv két részben: a támogatási rész felhasználása és várható megtérülése, majd a hitelrész törlesztése, a saját erő, a fedezet (biztosíték) és egy egyszerű cash-flow vázlat (magyarul, kb. 200 szó).`,
};

// Venture capital (Péter 8679): an investor buys a stake, nothing is paid back and nothing is granted.
// The investor reads the business plan, the capital structure, the valuation and the exit.
const EQUITY_BRIEF: DocumentBrief = {
  title: "Befektetői Előkészítő Üzleti Terv",
  programLabel: "Célzott Tőkeprogram:",
  headings: ["1. Vezetői Összefoglaló és Üzleti Terv", "2. Piac, Növekedési Potenciál és Cégérték", "3. Tőkeszerkezet, Értékelés és Kilépési Terv"],
  userPrompt: "Kérlek, generáld le a tőkeprogramhoz illeszkedő befektetői előkészítő üzleti terv vázlatot a megadott adatok alapján.",
  intro: `Te egy professzionális pályázatíró és befektetői anyagokat előkészítő AI asszisztens vagy.
A megadott cégprofil és tőkeprogram-adatok alapján készíts el egy Befektetői Előkészítő Üzleti Terv Vázlatot.
Ez kockázatitőke-befektetés: a befektető tulajdonrészt szerez a cégben. Ne nevezd támogatásnak vagy hitelnek, és ne írj visszafizetésről vagy törlesztésről.`,
  dataHeader: "Tőkeprogram adatai:",
  sections: `- "executive_summary": Vezetői összefoglaló és üzleti terv: a cég, a fejlesztési cél, és mire fordítja a cég a befektetést (magyarul, kb. 150 szó).
- "market_analysis": Piac, versenyelőny és növekedési potenciál: a cég piaca és skálázhatósága, ami a cégérték növekedését megalapozza, a TEÁOR kód és cégprofil alapján (magyarul, kb. 150-200 szó).
- "financial_plan": Tőkeszerkezet, értékelés és kilépés: a jelenlegi és a befektetés utáni tulajdonosi szerkezet elvei, a cégérték becslésének szempontjai a cég bevétele alapján, és a befektető kilépésének (exit) lehetséges útjai és időtávja (magyarul, kb. 150-200 szó).`,
};

/** The brief for a kind (card e388efe1). */
export function documentBrief(kind: GrantKind): DocumentBrief {
  if (kind === "loan") return LOAN_BRIEF;
  if (kind === "hybrid") return HYBRID_BRIEF;
  if (kind === "equity") return EQUITY_BRIEF;
  return GRANT_BRIEF;
}

export function documentSystemPrompt(brief: DocumentBrief, companyContext: string, grantContext: string): string {
  return `${brief.intro}

Kimeneti formátum: KIZÁRÓLAG egy érvényes JSON formátumot adhatsz vissza, az alábbi kulcsokkal:
${brief.sections}

Adatok a generáláshoz:
Cégadatok:
${companyContext}

${brief.dataHeader}
${grantContext}

${NO_MISSING_DATA_RULE}`;
}
