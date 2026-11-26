// The weekly-digest and digest-unsubscribe handlers (round 6, item A), with fake I/O.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleWeeklyDigest, type DigestDeps, type OutgoingEmail, type Recipient } from "./weekly-digest-handler.ts";
import { handleUnsubscribe } from "./digest-unsubscribe-handler.ts";
import { unsubscribeToken, type DigestGrant, type DigestMatch } from "./digest.ts";

const SECRET = "sched-secret";
const USECRET = "unsub-secret";
const SEND_SLOT = new Date("2026-11-30T06:00:00Z"); // Monday 07:00 Budapest
const OFF_SLOT = new Date("2026-11-30T05:00:00Z"); // Monday 06:00 Budapest
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

const grant = (id: string, over: Partial<DigestGrant> = {}): DigestGrant => ({
  id, title: `Pályázat ${id}`, amount_min: 1_000_000, amount_max: null, deadline: "2027-03-01T00:00:00Z", source_closed_at: null, ...over,
});
const freshMatch = (id: string): DigestMatch => ({ id, match_score: 80, status: "new", created_at: "2026-11-28T10:00:00Z", grants: grant(`g-${id}`) });

type World = {
  env?: Record<string, string | undefined>;
  now?: Date;
  recipients?: Recipient[];
  matches?: Record<string, DigestMatch[]>;
  followed?: Record<string, DigestGrant[]>;
  emails?: Record<string, string | null>;
  sendFails?: boolean;
};

function setup(w: World = {}) {
  const sent: OutgoingEmail[] = [];
  const marked: string[] = [];
  const env: Record<string, string | undefined> = {
    SCHEDULER_SECRET: SECRET, DIGEST_UNSUBSCRIBE_SECRET: USECRET, DIGEST_ENABLED: "true", DIGEST_ALLOWLIST: U1, RESEND_API_KEY: "re_test", SUPABASE_URL: "https://x.supabase.co",
    ...(w.env ?? {}),
  };
  const deps: DigestDeps = {
    env: (n) => env[n],
    now: () => w.now ?? SEND_SLOT,
    listRecipients: () => Promise.resolve(w.recipients ?? [{ id: U1, last_sent_at: null }]),
    getEmail: (u) => Promise.resolve(w.emails && u in w.emails ? w.emails[u] : `${u.slice(0, 2)}@example.test`),
    getCompany: (u) => Promise.resolve({ name: "Teszt Kft.", businessIds: [`b-${u}`] }),
    getMatches: (ids) => Promise.resolve(ids.flatMap((b) => (w.matches ?? { [`b-${U1}`]: [freshMatch("m1")], [`b-${U2}`]: [freshMatch("m2")] })[b] ?? [])),
    getFollowed: (u) => Promise.resolve((w.followed ?? {})[u] ?? []),
    send: (e) => (w.sendFails ? Promise.reject(new Error("resend 500")) : (sent.push(e), Promise.resolve())),
    markSent: (u) => (marked.push(u), Promise.resolve()),
    log: () => {},
  };
  return { deps, sent, marked };
}

const req = (body: unknown = {}, auth: string | null = `Bearer ${SECRET}`, method = "POST") =>
  new Request("https://x/weekly-digest", {
    method,
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

// --- access ----------------------------------------------------------------------------------------------------

Deno.test("no secret configured: 503; a wrong or missing bearer: 401; nothing is sent", async () => {
  const a = setup({ env: { SCHEDULER_SECRET: undefined } });
  assertEquals((await handleWeeklyDigest(req(), a.deps)).status, 503);
  const b = setup();
  assertEquals((await handleWeeklyDigest(req({}, "Bearer wrong"), b.deps)).status, 401);
  assertEquals((await handleWeeklyDigest(req({}, null), b.deps)).status, 401);
  assertEquals(b.sent.length, 0);
});

// --- the gates -------------------------------------------------------------------------------------------------

Deno.test("DIGEST_ENABLED off: nothing goes, even in a test run", async () => {
  for (const flag of [undefined, "false", "1"]) {
    const s = setup({ env: { DIGEST_ENABLED: flag } });
    const res = await handleWeeklyDigest(req({ test: true }), s.deps);
    assertEquals((await res.json()).skipped, "disabled");
    assertEquals(s.sent.length, 0);
  }
});

Deno.test("outside Monday 07:00 Budapest the scheduled run sends nothing", async () => {
  const s = setup({ now: OFF_SLOT });
  assertEquals((await (await handleWeeklyDigest(req(), s.deps)).json()).skipped, "not_send_slot");
  assertEquals(s.sent.length, 0);
});

Deno.test("THE SAFETY GATE: only allowlisted users get it; everyone else on the opt-in list is skipped (both directions)", async () => {
  const s = setup({ recipients: [{ id: U1, last_sent_at: null }, { id: U2, last_sent_at: null }] });
  const out = await (await handleWeeklyDigest(req(), s.deps)).json();
  assertEquals(s.sent.map((e) => e.to), ["11@example.test"]);
  assertEquals([out.sent, out.notAllowed], [1, 1]);
  // and an empty allowlist reaches nobody, also in a test run
  const none = setup({ env: { DIGEST_ALLOWLIST: "" }, recipients: [{ id: U1, last_sent_at: null }] });
  await handleWeeklyDigest(req({ test: true }), none.deps);
  assertEquals(none.sent.length, 0);
  // "*" (after Péter's approval) reaches every opted-in user
  const all = setup({ env: { DIGEST_ALLOWLIST: "*" }, recipients: [{ id: U1, last_sent_at: null }, { id: U2, last_sent_at: null }] });
  await handleWeeklyDigest(req(), all.deps);
  assertEquals(all.sent.length, 2);
});

Deno.test("once a week: a user already sent to in this local week is skipped; last week's send is not", async () => {
  const s = setup({ recipients: [{ id: U1, last_sent_at: "2026-11-30T05:00:00Z" }] });
  assertEquals((await (await handleWeeklyDigest(req(), s.deps)).json()).alreadySent, 1);
  assertEquals(s.sent.length, 0);
  const t = setup({ recipients: [{ id: U1, last_sent_at: "2026-11-23T06:00:00Z" }] });
  await handleWeeklyDigest(req(), t.deps);
  assertEquals(t.sent.length, 1);
});

Deno.test("an empty week sends no e-mail and stamps nothing", async () => {
  const s = setup({ matches: {} });
  const out = await (await handleWeeklyDigest(req(), s.deps)).json();
  assertEquals([out.empty, out.sent, s.marked.length], [1, 0, 0]);
});

// --- the e-mail ------------------------------------------------------------------------------------------------

Deno.test("the scheduled send: from our sender, the one-click headers, a per-week key, and last_sent_at stamped", async () => {
  const s = setup();
  await handleWeeklyDigest(req(), s.deps);
  const e = s.sent[0];
  assertEquals(e.from, "P-Search <noreply@mail.pohankaestarsa.com>");
  assertEquals(e.idempotencyKey, `digest:${U1}:2026-W49`);
  assertEquals(e.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  const unsub = e.headers["List-Unsubscribe"].slice(1, -1);
  assertEquals(new URL(unsub).searchParams.get("t"), await unsubscribeToken(USECRET, U1));
  assert(e.text.includes(unsub));
  assertEquals(s.marked, [U1]);
});

Deno.test("a test run: any time, does not stamp last_sent_at, and has its own key (repeatable)", async () => {
  const s = setup({ now: new Date("2026-11-26T14:00:00Z"), recipients: [{ id: U1, last_sent_at: "2026-11-26T13:00:00Z" }] });
  const out = await (await handleWeeklyDigest(req({ test: true }), s.deps)).json();
  assertEquals([out.test, out.sent], [true, 1]);
  assert(s.sent[0].idempotencyKey.startsWith(`digest-test:${U1}:`));
  assertEquals(s.marked, []);
});

Deno.test("a failed send is counted, not stamped, and the run goes on", async () => {
  const s = setup({ sendFails: true });
  const out = await (await handleWeeklyDigest(req(), s.deps)).json();
  assertEquals([out.failed, out.sent, s.marked.length], [1, 0, 0]);
});

Deno.test("no e-mail address: counted as failed, nothing sent", async () => {
  const s = setup({ emails: { [U1]: null } });
  const out = await (await handleWeeklyDigest(req(), s.deps)).json();
  assertEquals([out.failed, s.sent.length], [1, 0]);
});

Deno.test("Resend key or project URL missing: 503 before anyone is touched", async () => {
  for (const missing of ["RESEND_API_KEY", "SUPABASE_URL"]) {
    const s = setup({ env: { [missing]: undefined } });
    assertEquals((await handleWeeklyDigest(req(), s.deps)).status, 503);
    assertEquals(s.sent.length, 0);
  }
});

// --- unsubscribe ---------------------------------------------------------------------------------------------
// A GET never changes anything (mail scanners open links): it redirects to the confirm page with the action in the
// fragment. The page's POST (confirm=page) and the mail client's one-click POST opt out.

const PAGE = "https://p-search-mobil.vercel.app/leiratkozas";
function unsubDeps(env: Record<string, string | undefined> = {}) {
  const out: string[] = [];
  return {
    out,
    deps: {
      env: (n: string) => ({ DIGEST_UNSUBSCRIBE_SECRET: USECRET, SUPABASE_URL: "https://x.supabase.co", ...env } as Record<string, string | undefined>)[n],
      optOut: (u: string) => (out.push(u), Promise.resolve()),
      log: () => {},
    },
  };
}
const unsubReq = (u: string, t: string, method = "GET", body?: string) =>
  new Request(`https://x.supabase.co/functions/v1/digest-unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`, {
    method,
    ...(body === undefined ? {} : { body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
  });

Deno.test("unsubscribe GET with a valid token: changes nothing, redirects to the confirm page with the action in the fragment", async () => {
  const d = unsubDeps();
  const t = await unsubscribeToken(USECRET, U1);
  const res = await handleUnsubscribe(unsubReq(U1, t), d.deps);
  assertEquals(res.status, 302);
  assertEquals(res.headers.get("Location"), `${PAGE}#a=${encodeURIComponent(`https://x.supabase.co/functions/v1/digest-unsubscribe?u=${U1}&t=${t}`)}`);
  assertEquals(d.out, []);
});

Deno.test("unsubscribe from the confirm page (confirm=page): opts out, 303 to ok=1", async () => {
  const d = unsubDeps();
  const res = await handleUnsubscribe(unsubReq(U1, await unsubscribeToken(USECRET, U1), "POST", "confirm=page"), d.deps);
  assertEquals([res.status, res.headers.get("Location")], [303, `${PAGE}?ok=1`]);
  assertEquals(d.out, [U1]);
});

Deno.test("unsubscribe one-click POST (RFC 8058): opts out, 200", async () => {
  const d = unsubDeps();
  const res = await handleUnsubscribe(unsubReq(U1, await unsubscribeToken(USECRET, U1), "POST", "List-Unsubscribe=One-Click"), d.deps);
  assertEquals(res.status, 200);
  assertEquals(d.out, [U1]);
});

Deno.test("unsubscribe with another user's token, a broken token, a non-uuid, the scheduler secret's token or no key: nothing changes", async () => {
  const tokenOfU2 = await unsubscribeToken(USECRET, U2);
  const cases: [string, string, Record<string, string | undefined>][] = [
    [U1, tokenOfU2, {}],
    [U1, "garbage", {}],
    ["not-a-uuid", await unsubscribeToken(USECRET, "not-a-uuid"), {}],
    [U1, await unsubscribeToken(SECRET, U1), {}],
    [U1, await unsubscribeToken(USECRET, U1), { DIGEST_UNSUBSCRIBE_SECRET: undefined }],
    // no fallback to the scheduler secret when the links' own key is missing
    [U1, await unsubscribeToken(SECRET, U1), { DIGEST_UNSUBSCRIBE_SECRET: undefined, SCHEDULER_SECRET: SECRET }],
  ];
  for (const [u, t, env] of cases) {
    const d = unsubDeps(env);
    assertEquals((await handleUnsubscribe(unsubReq(u, t), d.deps)).headers.get("Location"), `${PAGE}?ok=0`);
    const page = await handleUnsubscribe(unsubReq(u, t, "POST", "confirm=page"), d.deps);
    assertEquals([page.status, page.headers.get("Location")], [303, `${PAGE}?ok=0`]);
    assertEquals((await handleUnsubscribe(unsubReq(u, t, "POST", "List-Unsubscribe=One-Click"), d.deps)).status, 400);
    assertEquals(d.out, []);
  }
});

Deno.test("unsubscribe: a failing update says so (page ok=0 / one-click 500); other methods 405", async () => {
  const d = unsubDeps();
  const failing = { ...d.deps, optOut: () => Promise.reject(new Error("db")) };
  const t = await unsubscribeToken(USECRET, U1);
  assertEquals((await handleUnsubscribe(unsubReq(U1, t, "POST", "confirm=page"), failing)).headers.get("Location"), `${PAGE}?ok=0`);
  assertEquals((await handleUnsubscribe(unsubReq(U1, t, "POST"), failing)).status, 500);
  assertEquals((await handleUnsubscribe(unsubReq(U1, t, "DELETE"), unsubDeps().deps)).status, 405);
});

Deno.test("weekly-digest without DIGEST_UNSUBSCRIBE_SECRET: 503 and nothing read or sent", async () => {
  const s = setup({ env: { DIGEST_UNSUBSCRIBE_SECRET: undefined } });
  assertEquals((await handleWeeklyDigest(req(), s.deps)).status, 503);
  assertEquals(s.sent.length, 0);
});
