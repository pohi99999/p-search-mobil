// The weekly e-mail digest (P-Search round 6, item A; Péter 18328 via Marveen 9160, plan approved 9199).
// Pure module: time slots, the week key, the unsubscribe token, what goes into a digest, and its text.
// No Deno API, no network; the handler (weekly-digest-handler.ts) does the I/O.
import { MIN_MATCH_SCORE, openGrantCutoffIso } from './matching.ts';
import { candidateVerdict } from './candidate-filter.ts';
import { formatAmountHu, formatDeadlineHu } from './grant-text.ts';

export const DIGEST_TIMEZONE = 'Europe/Budapest';
/** At most this many new matches, and this many deadlines, in one digest. */
export const DIGEST_MAX_ITEMS = 5;
/** A deadline this close (in days) goes into the "Közelgő határidők" part. */
export const DIGEST_DEADLINE_DAYS = 14;
/** The web app the e-mail links to (the project's Site URL, Marveen 9156). */
export const DEFAULT_APP_URL = 'https://p-search-mobil.vercel.app';
export const DIGEST_FROM = 'P-Search <noreply@mail.pohankaestarsa.com>';

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
}

export function localParts(now: Date, timeZone = DIGEST_TIMEZONE): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, weekday: weekdays[parts.weekday] };
}

/**
 * The send slot: Monday 07:xx in Budapest. pg_cron calls at 05:00 and 06:00 UTC (summer and winter time); only the
 * run that falls on 7 o'clock local sends (Marveen 9199: "07:00 helyi idő egész évben").
 */
export function isSendSlot(now: Date): boolean {
  const p = localParts(now);
  return p.weekday === 1 && p.hour === 7;
}

/** The ISO week of the local date, "2026-W48": one digest per user per week (the idempotency key). */
export function isoWeekKey(now: Date): string {
  const p = localParts(now);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dayNum = p.weekday; // 1..7, Monday first
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // the Thursday of this ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Was a digest already sent in the local week of `now`? (A second run in the same week must not send again.) */
export function sentThisWeek(lastSentAt: string | null | undefined, now: Date): boolean {
  if (!lastSentAt) return false;
  const last = new Date(lastSentAt);
  if (Number.isNaN(last.getTime())) return false;
  return isoWeekKey(last) === isoWeekKey(now);
}

/**
 * DIGEST_ALLOWLIST: comma-separated user ids, or "*" for every opted-in user. Anything else (unset, empty) is an
 * empty list: until Péter has approved the text and the first test e-mail, only the test account is listed.
 */
export function parseAllowlist(raw: string | undefined | null): { all: boolean; ids: Set<string> } {
  const value = (raw ?? '').trim();
  if (value === '*') return { all: true, ids: new Set() };
  return { all: false, ids: new Set(value.split(',').map((s) => s.trim()).filter(Boolean)) };
}

export function isAllowed(list: { all: boolean; ids: Set<string> }, userId: string): boolean {
  return list.all || list.ids.has(userId);
}

// ---------------------------------------------------------------------------------------------------------------
// The unsubscribe token: HMAC-SHA256 over a fixed label and the user id, keyed with the scheduler secret (the
// label keeps this key use apart from the scheduler's bearer check). base64url, 43 characters.

const UNSUBSCRIBE_LABEL = 'p-search-digest-unsubscribe:';

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function unsubscribeToken(secret: string, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(UNSUBSCRIBE_LABEL + userId));
  return base64url(new Uint8Array(sig));
}

function equalConstantTime(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function verifyUnsubscribeToken(secret: string, userId: string, token: string): Promise<boolean> {
  if (!secret || !userId || !token) return false;
  return equalConstantTime(await unsubscribeToken(secret, userId), token);
}

export function unsubscribeUrl(supabaseUrl: string, userId: string, token: string): string {
  const u = new URL(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/digest-unsubscribe`);
  u.searchParams.set('u', userId);
  u.searchParams.set('t', token);
  return u.toString();
}

// ---------------------------------------------------------------------------------------------------------------
// What goes into a digest.

export interface DigestGrant {
  id: string;
  title: string;
  provider?: string | null;
  grant_type?: string | null;
  amount_min?: number | null;
  amount_max?: number | null;
  deadline?: string | null;
  source_closed_at?: string | null;
}

export interface DigestMatch {
  id: string;
  match_score: number;
  status: string;
  created_at: string;
  grants: DigestGrant | null;
}

export interface DigestItems {
  newMatches: DigestMatch[];
  deadlines: DigestGrant[];
}

/** The local start of `now`'s day, as an instant: a deadline on today's date is still open (the same cut the app
 *  and the matching use, matching.ts openGrantCutoffIso). */
function startOfLocalDay(now: Date): number {
  return Date.parse(openGrantCutoffIso(now, DIGEST_TIMEZONE));
}

/** Open: not closed at the source, and the deadline (if any) is today or later in Budapest. */
export function isOpenGrant(g: DigestGrant, now: Date): boolean {
  if (g.source_closed_at) return false;
  if (!g.deadline) return true;
  const d = new Date(g.deadline).getTime();
  return !Number.isNaN(d) && d >= startOfLocalDay(now);
}

/** A match the app shows: not stale, at or above the threshold, a financial grant, still open. */
export function isVisibleMatch(m: DigestMatch, now: Date): boolean {
  if (!m.grants || m.status === 'stale' || m.match_score < MIN_MATCH_SCORE) return false;
  if (!candidateVerdict(m.grants).keep) return false;
  return isOpenGrant(m.grants, now);
}

/**
 * The digest's content: the matches that came since `since` (best first), and the open grants among the followed
 * ones and the visible matches whose deadline is within DIGEST_DEADLINE_DAYS (nearest first). Each part at most
 * DIGEST_MAX_ITEMS. Both empty = no e-mail this week (Marveen 9199).
 */
export function selectDigestItems(input: { matches: DigestMatch[]; followed: DigestGrant[]; since: Date; now: Date }): DigestItems {
  const { matches, followed, since, now } = input;
  const visible = matches.filter((m) => isVisibleMatch(m, now));

  const newMatches = visible
    .filter((m) => new Date(m.created_at).getTime() > since.getTime())
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, DIGEST_MAX_ITEMS);

  const horizon = startOfLocalDay(now) + (DIGEST_DEADLINE_DAYS + 1) * 86400000;
  const byId = new Map<string, DigestGrant>();
  for (const g of [...followed, ...visible.map((m) => m.grants as DigestGrant)]) {
    if (!g || byId.has(g.id) || !g.deadline || !isOpenGrant(g, now) || !candidateVerdict(g).keep) continue;
    if (new Date(g.deadline).getTime() < horizon) byId.set(g.id, g);
  }
  const deadlines = [...byId.values()]
    .sort((a, b) => new Date(a.deadline as string).getTime() - new Date(b.deadline as string).getTime())
    .slice(0, DIGEST_MAX_ITEMS);

  return { newMatches, deadlines };
}

export function isEmptyDigest(items: DigestItems): boolean {
  return items.newMatches.length === 0 && items.deadlines.length === 0;
}

// ---------------------------------------------------------------------------------------------------------------
// The text. DRAFT for Péter's approval (Marveen 9199: he sees the text and the first test e-mail before anyone
// else gets one). Hungarian, no em dash, no promise beyond what the app does.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface RenderInput {
  companyName: string | null;
  items: DigestItems;
  appUrl: string;
  unsubscribeUrl: string;
}

export function digestSubject(items: DigestItems): string {
  const n = items.newMatches.length;
  if (n > 0) return `P-Search: ${n} új, a cégedhez illő pályázat`;
  return 'P-Search: közelgő pályázati határidők';
}

function matchLine(m: DigestMatch): string {
  const g = m.grants as DigestGrant;
  const parts = [`${g.title} (egyezés: ${m.match_score}%)`];
  const amount = formatAmountHu(g.amount_min ?? null, g.amount_max ?? null);
  if (amount) parts.push(`összeg: ${amount}`);
  const deadline = formatDeadlineHu(g.deadline ?? null);
  if (deadline) parts.push(`határidő: ${deadline}`);
  return parts.join(', ');
}

function deadlineLine(g: DigestGrant): string {
  return `${g.title}: ${formatDeadlineHu(g.deadline ?? null) ?? ''}`.trim();
}

export function renderDigest(input: RenderInput): { subject: string; text: string; html: string } {
  const { companyName, items, appUrl, unsubscribeUrl } = input;
  const greeting = companyName ? `Kedves ${companyName}!` : 'Kedves Felhasználó!';
  const subject = digestSubject(items);

  const textParts: string[] = [greeting, ''];
  const htmlParts: string[] = [`<p>${escapeHtml(greeting)}</p>`];

  if (items.newMatches.length) {
    textParts.push('Új, a cégedhez illő pályázatok az elmúlt hétből:', ...items.newMatches.map((m) => `- ${matchLine(m)}`), '');
    htmlParts.push(
      '<p><strong>Új, a cégedhez illő pályázatok az elmúlt hétből:</strong></p>',
      `<ul>${items.newMatches.map((m) => `<li>${escapeHtml(matchLine(m))}</li>`).join('')}</ul>`,
    );
  }
  if (items.deadlines.length) {
    textParts.push(`Közelgő határidők (${DIGEST_DEADLINE_DAYS} napon belül):`, ...items.deadlines.map((g) => `- ${deadlineLine(g)}`), '');
    htmlParts.push(
      `<p><strong>Közelgő határidők (${DIGEST_DEADLINE_DAYS} napon belül):</strong></p>`,
      `<ul>${items.deadlines.map((g) => `<li>${escapeHtml(deadlineLine(g))}</li>`).join('')}</ul>`,
    );
  }

  const note = 'A P-Search összefoglalja a kiírások adatait, de a beadás előtt mindig a hivatalos kiírás a mérvadó.';
  const why = 'Ezt a levelet azért kapod, mert a P-Searchben kérted a heti összefoglalót.';
  textParts.push(`Megnyitom a P-Searchben: ${appUrl}`, '', note, '', why, `Leiratkozás egy kattintással: ${unsubscribeUrl}`);
  htmlParts.push(
    `<p><a href="${escapeHtml(appUrl)}">Megnyitom a P-Searchben</a></p>`,
    `<p style="color:#555;font-size:13px">${escapeHtml(note)}</p>`,
    `<p style="color:#555;font-size:13px">${escapeHtml(why)} <a href="${escapeHtml(unsubscribeUrl)}">Leiratkozás</a></p>`,
  );

  return { subject, text: textParts.join('\n'), html: `<!doctype html><html lang="hu"><body>${htmlParts.join('')}</body></html>` };
}

/**
 * Every row of an ordered, paged read (Ellenőr 9371, tip 2: one unordered limit(500) left it undefined who gets the
 * digest above 500 subscribers). `fetchPage(from, to)` is an inclusive range of an ORDERED query; reading stops at the
 * first short page. Throws past `maxPages` rather than silently mailing a part.
 */
export async function collectPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 500,
  maxPages = 200,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; ; page++) {
    if (page >= maxPages) throw new Error(`more than ${maxPages * pageSize} rows`);
    const rows = await fetchPage(page * pageSize, page * pageSize + pageSize - 1);
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}
