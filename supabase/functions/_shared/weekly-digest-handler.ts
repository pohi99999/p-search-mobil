// The weekly-digest Edge Function's logic (round 6, item A), with its I/O passed in so it is tested without a network
// or a database. weekly-digest/index.ts wires the real Supabase and Resend calls.
import {
  DEFAULT_APP_URL,
  DIGEST_FROM,
  isAllowed,
  isEmptyDigest,
  isoWeekKey,
  isSendSlot,
  parseAllowlist,
  renderDigest,
  selectDigestItems,
  sentThisWeek,
  unsubscribeToken,
  unsubscribeUrl,
  type DigestGrant,
  type DigestMatch,
} from './digest.ts';

export interface Recipient {
  id: string;
  last_sent_at: string | null;
}

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  idempotencyKey: string;
}

export interface DigestDeps {
  env: (name: string) => string | undefined;
  now: () => Date;
  /** Opted-in users (weekly_digest = true). */
  listRecipients: () => Promise<Recipient[]>;
  getEmail: (userId: string) => Promise<string | null>;
  /** The user's company name and business profile ids. */
  getCompany: (userId: string) => Promise<{ name: string | null; businessIds: string[] }>;
  getMatches: (businessIds: string[]) => Promise<DigestMatch[]>;
  /** The user's followed grants (public.followed_grants); an empty list where the table is not there yet. */
  getFollowed: (userId: string) => Promise<DigestGrant[]>;
  send: (email: OutgoingEmail) => Promise<void>;
  markSent: (userId: string, at: string) => Promise<void>;
  log?: (line: string) => void;
}

export interface DigestRunSummary {
  ok: true;
  skipped?: 'disabled' | 'not_send_slot';
  test: boolean;
  considered: number;
  sent: number;
  empty: number;
  alreadySent: number;
  notAllowed: number;
  failed: number;
}

function secureCompare(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * POST, Bearer SCHEDULER_SECRET (pg_cron, or an operator for a test run).
 * Body `{ "test": true }`: skips the Monday-07:00 gate and the once-a-week rule, does not stamp last_sent_at, and
 * uses a per-minute idempotency key: for the first test e-mail to the test account. The allowlist and
 * DIGEST_ENABLED apply to test runs too: a test run can never reach anyone not on the list.
 */
export async function handleWeeklyDigest(req: Request, deps: DigestDeps): Promise<Response> {
  const log = deps.log ?? ((l: string) => console.log(l));
  if (req.method !== 'POST') return json({ error: 'Csak POST.' }, 405);

  const expected = deps.env('SCHEDULER_SECRET');
  if (!expected) return json({ error: 'A szolgáltatás nincs konfigurálva.' }, 503);
  const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!secureCompare(presented, expected)) return json({ error: 'Hozzáférés megtagadva' }, 401);

  let test = false;
  try {
    const body = await req.json();
    test = body?.test === true;
  } catch {
    test = false;
  }

  const summary: DigestRunSummary = { ok: true, test, considered: 0, sent: 0, empty: 0, alreadySent: 0, notAllowed: 0, failed: 0 };
  if (deps.env('DIGEST_ENABLED') !== 'true') return json({ ...summary, skipped: 'disabled' }, 200);

  const now = deps.now();
  if (!test && !isSendSlot(now)) return json({ ...summary, skipped: 'not_send_slot' }, 200);

  const apiKey = deps.env('RESEND_API_KEY');
  const supabaseUrl = deps.env('SUPABASE_URL');
  if (!apiKey || !supabaseUrl) return json({ error: 'A levélküldés nincs konfigurálva.' }, 503);

  const allow = parseAllowlist(deps.env('DIGEST_ALLOWLIST'));
  const appUrl = deps.env('DIGEST_APP_URL') || DEFAULT_APP_URL;
  const week = isoWeekKey(now);

  for (const r of await deps.listRecipients()) {
    summary.considered++;
    if (!isAllowed(allow, r.id)) {
      summary.notAllowed++;
      continue;
    }
    if (!test && sentThisWeek(r.last_sent_at, now)) {
      summary.alreadySent++;
      continue;
    }
    try {
      const company = await deps.getCompany(r.id);
      const matches = company.businessIds.length ? await deps.getMatches(company.businessIds) : [];
      const followed = await deps.getFollowed(r.id);
      const since = r.last_sent_at ? new Date(r.last_sent_at) : new Date(now.getTime() - 7 * 86400000);
      const items = selectDigestItems({ matches, followed, since, now });
      if (isEmptyDigest(items)) {
        summary.empty++;
        continue;
      }
      const email = await deps.getEmail(r.id);
      if (!email) {
        summary.failed++;
        log(`digest user=${r.id} reason=no_email`);
        continue;
      }
      const unsub = unsubscribeUrl(supabaseUrl, r.id, await unsubscribeToken(expected, r.id));
      const content = renderDigest({ companyName: company.name, items, appUrl, unsubscribeUrl: unsub });
      await deps.send({
        from: DIGEST_FROM,
        to: email,
        ...content,
        // RFC 8058 one-click unsubscribe (Gmail and Yahoo expect it from bulk senders); the POST goes to the same URL.
        headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        idempotencyKey: test ? `digest-test:${r.id}:${now.toISOString().slice(0, 16)}` : `digest:${r.id}:${week}`,
      });
      if (!test) await deps.markSent(r.id, now.toISOString());
      summary.sent++;
      log(`digest user=${r.id} sent test=${test} matches=${items.newMatches.length} deadlines=${items.deadlines.length}`);
    } catch (err) {
      summary.failed++;
      log(`digest user=${r.id} failed=${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return json(summary, 200);
}
