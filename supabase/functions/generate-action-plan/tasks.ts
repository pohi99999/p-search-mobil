// Tasks of a generated action plan (card a815756f, P-Search common test 2026-10-07): they come from the
// "Következő lépések" (Next Steps) section only. The old /^[*-]\s+(.+)$/gm took the first five bullets of
// the whole markdown, which were the GOALS; the titles kept the '**...:**' markup, every description was
// the placeholder "Automatikusan generált feladat az akciótervből: <uuid>", and substring(0, 100) cut
// mid-word.

export interface PlanTask {
  title: string;
  description: string;
}

export const MAX_TASKS = 5;
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 500;

/** Gemini often wraps the whole answer in ```markdown ... ```; the stored plan should not carry it. */
export function stripMarkdownFence(md: string): string {
  const m = md.trim().match(/^```[a-z]*\s*\n([\s\S]*?)\n?```$/i);
  return m ? m[1].trim() : md.trim();
}

/** Inline markdown off: **bold**, __bold__, *em*, `code`; spaces collapsed. */
export function cleanInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, "$1$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** At most `max` characters, cut at a word boundary with an ellipsis. */
export function cutAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const space = head.lastIndexOf(" ");
  return `${(space > max / 2 ? head.slice(0, space) : head).replace(/[\s,;:.–-]+$/, "")}…`;
}

const NEXT_STEPS = /^\s*(?:#{1,6}\s*|\*\*\s*)?(?:\d+\.\s*)?(?:Következő\s+lépések|Next\s+steps)\b/i;
const HEADING = /^\s*(?:#{1,6}\s+\S|\*\*\s*\d+\.\s)/;
const ITEM = /^(\s*)(?:\d+[.)]|[*-])\s+(.+)$/;

/** The first MAX_TASKS top-level items of the "Következő lépések" section, with their sub-points as description. */
export function extractNextSteps(markdown: string): PlanTask[] {
  const lines = stripMarkdownFence(markdown).split("\n");
  const start = lines.findIndex((l) => NEXT_STEPS.test(l));
  if (start < 0) return [];

  const items: { head: string; sub: string[] }[] = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    const m = line.match(ITEM);
    if (m && m[1].length < 2) items.push({ head: m[2], sub: [] });
    else if (items.length && line.trim()) items[items.length - 1].sub.push(line.trim().replace(/^(?:\d+[.)]|[*-])\s+/, ""));
  }

  return items.slice(0, MAX_TASKS).map(({ head, sub }) => {
    // "**Title:** text" -> title + the text as the first line of the description
    const split = head.match(/^\*\*(.+?):?\*\*:?\s*(.*)$/);
    const title = cleanInline(split ? split[1] : head).replace(/:$/, "");
    const rest = [split?.[2] ?? "", ...sub].map(cleanInline).filter(Boolean);
    return { title: cutAtWord(title, TITLE_MAX), description: cutAtWord(rest.join("\n"), DESCRIPTION_MAX) };
  });
}
