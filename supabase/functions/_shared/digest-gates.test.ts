// The weekly digest's safety gates, measured independently (written by Ellenor for the #302 review, 9346/9371;
// taken into the repo so the gates stay guarded: an '*' inside the allowlist, prefix-matched ids, a secret in a log
// line or a response, a non-boolean test flag, a rolling 7 days instead of the ISO week, an unescaped company name).
// The clock and the ISO week are computed here WITHOUT Intl (EU rule), so a mistake shared with digest.ts cannot hide.
import assert from "node:assert/strict";
import { handleWeeklyDigest } from "./weekly-digest-handler.ts";
import { handleUnsubscribe } from "./digest-unsubscribe-handler.ts";
import { isSendSlot, isoWeekKey, sentThisWeek, unsubscribeToken, verifyUnsubscribeToken } from "./digest.ts";

const SECRET = "CANARY-SCHED-SECRET-7f3a91";
const RESEND = "CANARY-RESEND-KEY-c20d44";
const USECRET = "CANARY-UNSUB-SECRET-5e19b2"; // DIGEST_UNSUBSCRIBE_SECRET, the links' own key
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // the test account
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // real user
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // real user
const NOW = new Date("2026-11-23T06:00:00Z"); // Monday 07:00 CET (a valid send slot)

// --- an independent Budapest clock: EU rule, NOT Intl ------------------------------------------------------------
function lastSundayUtc1(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month + 1, 0, 1, 0, 0)); // last day of month 01:00 UTC
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // back to Sunday
  return d.getTime();
}
const offsetH = (ms: number) => {
  const y = new Date(ms).getUTCFullYear();
  return ms >= lastSundayUtc1(y, 2) && ms < lastSundayUtc1(y, 9) ? 2 : 1;
};
const local = (ms: number) => new Date(ms + offsetH(ms) * 3600e3); // read with getUTC*
const wdMon1 = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
function weeksInYear(y: number) {
  const p = (x: number) => (x + Math.floor(x / 4) - Math.floor(x / 100) + Math.floor(x / 400)) % 7;
  return p(y) === 4 || p(y - 1) === 3 ? 53 : 52;
}
function isoKeyIndependent(ms: number): string {
  const l = local(ms);
  let y = l.getUTCFullYear();
  const ordinal = Math.floor((Date.UTC(y, l.getUTCMonth(), l.getUTCDate()) - Date.UTC(y, 0, 0)) / 86400e3);
  let w = Math.floor((ordinal - wdMon1(l) + 10) / 7);
  if (w < 1) { y -= 1; w = weeksInYear(y); } else if (w > weeksInYear(y)) { y += 1; w = 1; }
  return `${y}-W${String(w).padStart(2, "0")}`;
}
const localInstant = (y: number, m: number, d: number, h: number, mi: number) => {
  const asUtc = Date.UTC(y, m - 1, d, h, mi);
  return asUtc - offsetH(asUtc - 3600e3) * 3600e3; // h is never in a DST gap in the samples below
};

Deno.test("independent clock sanity: known instants", () => {
  assert.equal(local(Date.parse("2026-07-01T12:00:00Z")).getUTCHours(), 14); // CEST
  assert.equal(local(Date.parse("2026-12-01T12:00:00Z")).getUTCHours(), 13); // CET
  assert.equal(isoKeyIndependent(Date.parse("2026-12-28T12:00:00Z")), "2026-W53");
  assert.equal(isoKeyIndependent(Date.parse("2027-01-04T12:00:00Z")), "2027-W01");
  assert.equal(isoKeyIndependent(Date.parse("2025-12-29T12:00:00Z")), "2026-W01");
});

// --- the cron slots: both cron instants, every Monday of four years ---------------------------------------------
Deno.test("every Monday 2026-2029: of the two cron instants (05:00Z, 06:00Z) exactly ONE is the send slot, and it is local 07:xx", () => {
  let mondays = 0;
  for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2030, 0, 1); ms += 86400e3) {
    const d = new Date(ms);
    if (d.getUTCDay() !== 1) continue;
    mondays++;
    const at05 = ms + 5 * 3600e3, at06 = ms + 6 * 3600e3;
    const s05 = isSendSlot(new Date(at05)), s06 = isSendSlot(new Date(at06));
    assert.equal(Number(s05) + Number(s06), 1, `Monday ${d.toISOString().slice(0, 10)}: 05Z=${s05} 06Z=${s06}`);
    const winner = s05 ? at05 : at06;
    const l = local(winner);
    assert.equal(l.getUTCHours(), 7, `local hour at ${new Date(winner).toISOString()}`);
    assert.equal(wdMon1(l), 1);
    // a delayed cron (up to 59:59 late) still sends, and the same instant + 1 hour does not
    assert.equal(isSendSlot(new Date(winner + 59 * 60e3 + 59e3)), true);
    assert.equal(isSendSlot(new Date(winner + 3600e3)), false);
    assert.equal(isSendSlot(new Date(winner - 1000)), false);
  }
  assert.ok(mondays > 200, `only ${mondays} Mondays`);
});

Deno.test("no other weekday is ever a slot at 07:xx local (every day of 2026-2027, every hour)", () => {
  for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2028, 0, 1); ms += 3600e3) {
    const l = local(ms);
    const expected = wdMon1(l) === 1 && l.getUTCHours() === 7;
    assert.equal(isSendSlot(new Date(ms)), expected, new Date(ms).toISOString());
  }
});

// --- the week key against the independent ISO-week algorithm ----------------------------------------------------
Deno.test("isoWeekKey equals the independent ISO week for every local day 2024-2031 at 00:30, 12:00, 23:30", () => {
  let n = 0;
  for (let ms = Date.UTC(2024, 0, 1); ms < Date.UTC(2031, 0, 1); ms += 86400e3) {
    const d = new Date(ms);
    for (const [h, mi] of [[0, 30], [12, 0], [23, 30]]) {
      const t = localInstant(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, mi);
      assert.equal(isoWeekKey(new Date(t)), isoKeyIndependent(t), `${d.toISOString().slice(0, 10)} ${h}:${mi}`);
      n++;
    }
  }
  assert.ok(n > 7000);
});

Deno.test("sentThisWeek at the year boundary (2026-W53 / 2027-W01) and around DST weeks", () => {
  const L = (y: number, m: number, d: number, h = 12, mi = 0) => new Date(localInstant(y, m, d, h, mi)).toISOString();
  const now = (y: number, m: number, d: number, h = 7, mi = 0) => new Date(localInstant(y, m, d, h, mi));
  // 2026-W53 = Mon 12-28 .. Sun 01-03
  assert.equal(sentThisWeek(L(2026, 12, 28, 7, 5), now(2026, 12, 28, 7, 30)), true);
  assert.equal(sentThisWeek(L(2027, 1, 3, 23, 30), now(2026, 12, 28)), true);
  assert.equal(sentThisWeek(L(2026, 12, 28, 7, 5), now(2027, 1, 4)), false); // next Monday = 2027-W01
  assert.equal(sentThisWeek(L(2027, 1, 1), now(2027, 1, 4)), false);
  assert.equal(sentThisWeek(L(2025, 12, 29), now(2026, 1, 2)), true); // both 2026-W01
  assert.equal(sentThisWeek(L(2025, 12, 28), now(2025, 12, 29)), false); // Sunday W52 vs Monday W01
  // the DST-change weeks: the Monday after the clock change is a new week
  assert.equal(sentThisWeek(L(2027, 3, 22), now(2027, 3, 29)), false);
  assert.equal(sentThisWeek(L(2026, 10, 19), now(2026, 10, 26)), false);
  assert.equal(sentThisWeek(null, now(2026, 11, 23)), false);
  assert.equal(sentThisWeek("not a date", now(2026, 11, 23)), false);
});

// --- a world with a non-empty digest for every user (positive control comes first) -----------------------------
const grant = (id: string) => ({ id, title: `Pályázat ${id}`, amount_min: 1_000_000, amount_max: null, deadline: "2027-03-01T00:00:00Z", source_closed_at: null });
const match = (id: string) => ({ id, match_score: 80, status: "new", created_at: "2026-11-23T05:00:00Z", grants: grant(`g-${id}`) });

function world(over: { env?: Record<string, string | undefined>; now?: Date; recipients?: { id: string; last_sent_at: string | null }[]; company?: string | null } = {}) {
  const sent: any[] = [], marked: string[] = [], logs: string[] = [];
  const calls = { list: 0, email: 0, company: 0 };
  const env: Record<string, string | undefined> = {
    SCHEDULER_SECRET: SECRET, DIGEST_UNSUBSCRIBE_SECRET: USECRET, DIGEST_ENABLED: "true", DIGEST_ALLOWLIST: A, RESEND_API_KEY: RESEND, SUPABASE_URL: "https://x.supabase.co", ...(over.env ?? {}),
  };
  const deps = {
    env: (n: string) => env[n],
    now: () => over.now ?? NOW,
    listRecipients: () => { calls.list++; return Promise.resolve(over.recipients ?? [{ id: A, last_sent_at: null }, { id: B, last_sent_at: null }, { id: C, last_sent_at: null }]); },
    getEmail: (u: string) => { calls.email++; return Promise.resolve(`${u.slice(0, 4)}@example.test`); },
    getCompany: (u: string) => { calls.company++; return Promise.resolve({ name: over.company === undefined ? "Teszt Kft." : over.company, businessIds: [`b-${u}`] }); },
    getMatches: (ids: string[]) => Promise.resolve(ids.map((b) => match(`m-${b}`))),
    getFollowed: () => Promise.resolve([]),
    send: (e: any) => { sent.push(e); return Promise.resolve(); },
    markSent: (u: string) => { marked.push(u); return Promise.resolve(); },
    log: (l: string) => { logs.push(l); },
  };
  return { deps, sent, marked, logs, calls };
}
const post = (body: unknown = {}, auth: string | null = `Bearer ${SECRET}`, method = "POST") =>
  new Request("https://x/weekly-digest", { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) }, body: method === "POST" ? JSON.stringify(body) : undefined });
const tos = (w: { sent: any[] }) => w.sent.map((e) => e.to).sort();
const TO = (u: string) => `${u.slice(0, 4)}@example.test`;

Deno.test("POSITIVE CONTROL: enabled + allowlist [A] + slot: exactly A gets one mail, B and C do not", async () => {
  const w = world();
  const out = await (await handleWeeklyDigest(post(), w.deps)).json();
  assert.deepEqual(tos(w), [TO(A)]);
  assert.deepEqual([out.considered, out.sent, out.notAllowed], [3, 1, 2]);
  assert.deepEqual(w.marked, [A]);
});

Deno.test("DIGEST_ENABLED: only the exact string 'true' sends, in a scheduled AND in a test run", async () => {
  for (const flag of [undefined, "", "false", "TRUE", "True", "1", "yes", " true", "true ", "true\n", "on", "enabled"]) {
    for (const test of [false, true]) {
      const w = world({ env: { DIGEST_ENABLED: flag } });
      const out = await (await handleWeeklyDigest(post({ test }), w.deps)).json();
      assert.equal(w.sent.length, 0, `flag=${JSON.stringify(flag)} test=${test}`);
      assert.equal(out.skipped, "disabled");
      assert.equal(w.calls.list, 0, "no recipient read while disabled");
    }
  }
  const ok = world({ env: { DIGEST_ENABLED: "true" } });
  await handleWeeklyDigest(post({ test: true }), ok.deps);
  assert.equal(ok.sent.length, 1);
});

Deno.test("DIGEST_ALLOWLIST: unset/empty/blank/punctuation/lookalike words reach nobody (scheduled and test run)", async () => {
  for (const list of [undefined, "", " ", "   ", ",", " , ", ",,,", "undefined", "null", "none", "false", "0", "all", "ALL", "**", "* *", "*,", ",*"]) {
    for (const test of [false, true]) {
      const w = world({ env: { DIGEST_ALLOWLIST: list } });
      const out = await (await handleWeeklyDigest(post({ test }), w.deps)).json();
      assert.equal(w.sent.length, 0, `list=${JSON.stringify(list)} test=${test}`);
      assert.equal(out.sent, 0);
    }
  }
});

Deno.test("DIGEST_ALLOWLIST: ids are exact; '*' only when it is the whole value (trimmed); a '*' inside a list is just a bad id", async () => {
  const cases: [string, string[]][] = [
    [A, [A]], [`${A},${B}`, [A, B]], [` ${A} , ${B} `, [A, B]], [`${A},`, [A]], [`${B},${B}`, [B]],
    [A.toUpperCase(), []], [`${A}x`, []], [A.slice(0, 20), []], [`*,${A}`, [A]], [`${A},*`, [A]],
    ["*", [A, B, C]], ["  *  ", [A, B, C]],
  ];
  for (const [list, want] of cases) {
    for (const test of [false, true]) {
      const w = world({ env: { DIGEST_ALLOWLIST: list } });
      await handleWeeklyDigest(post({ test }), w.deps);
      assert.deepEqual(tos(w), want.map(TO).sort(), `list=${JSON.stringify(list)} test=${test}`);
    }
  }
});

Deno.test("scheduled vs test run: the test run needs no slot and stamps nothing; the scheduled run stamps only whom it mailed", async () => {
  const off = new Date("2026-11-23T05:00:00Z"); // Monday 06:00 CET: not the slot
  const s1 = world({ now: off });
  assert.equal((await (await handleWeeklyDigest(post({}), s1.deps)).json()).skipped, "not_send_slot");
  assert.equal(s1.sent.length + s1.calls.list, 0);
  const t = world({ now: off, env: { DIGEST_ALLOWLIST: `${A},${B}` } });
  await handleWeeklyDigest(post({ test: true }), t.deps);
  assert.deepEqual(tos(t), [TO(A), TO(B)]);
  assert.deepEqual(t.marked, [], "a test run never stamps last_sent_at");
  const real = world({ env: { DIGEST_ALLOWLIST: `${A},${B}` } });
  await handleWeeklyDigest(post({}), real.deps);
  assert.deepEqual(real.marked.sort(), [A, B]);
  // another weekday at 07:00 local: no scheduled send either
  const tue = world({ now: new Date("2026-11-24T06:00:00Z") });
  assert.equal((await (await handleWeeklyDigest(post({}), tue.deps)).json()).skipped, "not_send_slot");
});

Deno.test("test:true must be the boolean true: 'true', 1, {} do not open the slot", async () => {
  for (const body of [{ test: "true" }, { test: 1 }, { test: {} }, "test", null, []]) {
    const w = world({ now: new Date("2026-11-23T05:00:00Z") });
    const r = await handleWeeklyDigest(post(body), w.deps);
    assert.equal(w.sent.length, 0, JSON.stringify(body));
    assert.equal(r.status, 200);
  }
  const bad = new Request("https://x/", { method: "POST", headers: { Authorization: `Bearer ${SECRET}` }, body: "{not json" });
  const w = world({ now: new Date("2026-11-23T05:00:00Z") });
  await handleWeeklyDigest(bad, w.deps);
  assert.equal(w.sent.length, 0);
});

Deno.test("once a week: same local week skipped, previous week and a never-sent user are sent; last-sent exactly at the week edge", async () => {
  const mon = "2026-11-23T06:05:00Z"; // this Monday 07:05 local
  const sun = "2026-11-22T22:30:00Z"; // Sunday 23:30 local = LAST week
  const w = world({ env: { DIGEST_ALLOWLIST: "*" }, recipients: [{ id: A, last_sent_at: mon }, { id: B, last_sent_at: sun }, { id: C, last_sent_at: null }] });
  const out = await (await handleWeeklyDigest(post({}), w.deps)).json();
  assert.deepEqual(tos(w), [TO(B), TO(C)]);
  assert.equal(out.alreadySent, 1);
  // a re-run in the same slot after A was stamped does not resend to B or C either
  const again = world({ env: { DIGEST_ALLOWLIST: "*" }, recipients: [{ id: B, last_sent_at: NOW.toISOString() }, { id: C, last_sent_at: NOW.toISOString() }] });
  await handleWeeklyDigest(post({}), again.deps);
  assert.equal(again.sent.length, 0);
});

Deno.test("empty week: no mail and no stamp (nothing new since the last digest, nothing due)", async () => {
  const w = world({ recipients: [{ id: A, last_sent_at: "2026-11-23T05:30:00Z" }] }); // sent today earlier... but a test run ignores the weekly rule
  w.deps.getMatches = () => Promise.resolve([{ ...match("old"), created_at: "2026-11-01T10:00:00Z" }]);
  const out = await (await handleWeeklyDigest(post({ test: true }), w.deps)).json();
  assert.equal(w.sent.length, 0);
  assert.equal(out.empty, 1);
  assert.deepEqual(w.marked, []);
});

Deno.test("no database or mail work before the bearer is checked (401/405/503), and 503 without the secret", async () => {
  const bad: [Request, number][] = [
    [post({}, null), 401], [post({}, "Bearer nope"), 401], [post({}, `Bearer ${SECRET}x`), 401], [post({}, `Bearer ${SECRET.slice(0, -1)}`), 401],
    [post({}, SECRET), 200 /* a bare token without "Bearer " is accepted by the regex: measured below */], [post({}, "", "POST"), 401],
    [post({}, `Bearer ${SECRET}`, "GET"), 405], [post({}, `Bearer ${SECRET}`, "PUT"), 405],
  ];
  for (const [rq, status] of bad) {
    const w = world();
    const r = await handleWeeklyDigest(rq, w.deps);
    assert.equal(r.status, status, `${rq.method} ${rq.headers.get("Authorization")}`);
    if (status !== 200) assert.equal(w.calls.list + w.sent.length, 0);
  }
  const w = world({ env: { SCHEDULER_SECRET: undefined } });
  assert.equal((await handleWeeklyDigest(post({}), w.deps)).status, 503);
  assert.equal(w.calls.list + w.sent.length, 0);
  const noKey = world({ env: { RESEND_API_KEY: undefined } });
  assert.equal((await handleWeeklyDigest(post({}), noKey.deps)).status, 503);
  assert.equal(noKey.calls.list, 0);
  // no e-mail without a working unsubscribe link: the links' own key is required
  const noUnsub = world({ env: { DIGEST_UNSUBSCRIBE_SECRET: undefined } });
  assert.equal((await handleWeeklyDigest(post({}), noUnsub.deps)).status, 503);
  assert.equal(noUnsub.calls.list + noUnsub.sent.length, 0);
});

Deno.test("secrets: the scheduler secret and the Resend key are in no log line, no response body, no e-mail field", async () => {
  const bodies: string[] = [];
  const w = world({ env: { DIGEST_ALLOWLIST: "*" } });
  bodies.push(await (await handleWeeklyDigest(post({}), w.deps)).text());
  const fail = world({ env: { DIGEST_ALLOWLIST: "*" } });
  fail.deps.send = () => Promise.reject(new Error("resend 500"));
  bodies.push(await (await handleWeeklyDigest(post({}), fail.deps)).text());
  for (const [rq, mk] of [[post({}, "Bearer nope"), () => world()], [post({}), () => world({ env: { DIGEST_ENABLED: "false" } })], [post({}), () => world({ env: { RESEND_API_KEY: undefined } })]] as const) {
    const x = mk(); bodies.push(await (await handleWeeklyDigest(rq, x.deps)).text()); w.logs.push(...x.logs);
  }
  w.logs.push(...fail.logs);
  const hay = [...bodies, ...w.logs, ...w.sent.map((e) => JSON.stringify(e))].join("\n");
  assert.ok(w.sent.length === 3 && w.logs.length >= 3, "the scenario really sent and logged");
  assert.equal(hay.includes(SECRET), false, "scheduler secret leaked");
  assert.equal(hay.includes(RESEND), false, "resend key leaked");
  assert.equal(hay.includes(USECRET), false, "unsubscribe secret leaked");
});

Deno.test("each e-mail: its own unsubscribe link (valid for its user, invalid for the others), matching header, HTML-escaped company, no CR/LF in headers", async () => {
  const w = world({ env: { DIGEST_ALLOWLIST: "*" }, company: `Kft <script>alert(1)</script> & "x"` });
  await handleWeeklyDigest(post({}), w.deps);
  assert.equal(w.sent.length, 3);
  const ids: Record<string, string> = { [TO(A)]: A, [TO(B)]: B, [TO(C)]: C };
  for (const e of w.sent) {
    const me = ids[e.to];
    const m = /Leiratkozás egy kattintással: (\S+)/.exec(e.text)!;
    const u = new URL(m[1]);
    assert.equal(u.searchParams.get("u"), me);
    const tok = u.searchParams.get("t")!;
    assert.equal(tok.length, 43);
    assert.equal(await verifyUnsubscribeToken(USECRET, me, tok), true);
    assert.equal(await verifyUnsubscribeToken(SECRET, me, tok), false, "the scheduler secret is not the links' key");
    for (const other of [A, B, C].filter((x) => x !== me)) assert.equal(await verifyUnsubscribeToken(USECRET, other, tok), false, "a token must not work for another user");
    assert.equal(e.headers["List-Unsubscribe"], `<${m[1]}>`);
    assert.equal(e.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    for (const [k, v] of Object.entries(e.headers)) assert.equal(/[\r\n]/.test(k + v), false);
    assert.equal(/[\r\n]/.test(e.subject), false);
    assert.equal(e.html.includes("<script>"), false, "company name must be escaped in HTML");
    assert.ok(e.html.includes("&lt;script&gt;"));
    assert.ok(e.html.includes(`href="${m[1].replace(/&/g, "&amp;")}"`) || e.html.includes(m[1].replace(/&/g, "&amp;")), "html link is the same URL");
    assert.equal(e.idempotencyKey, `digest:${me}:2026-W48`);
  }
});

// --- the unsubscribe handler ---------------------------------------------------------------------------------------
// A GET never changes anything (a mail scanner opens links); the confirm page's POST (confirm=page) and the mail
// client's RFC 8058 one-click POST do. The key is DIGEST_UNSUBSCRIBE_SECRET.
const FN = "https://x.supabase.co/functions/v1/digest-unsubscribe";
function unsub(secret: string | undefined | null = USECRET, extra: Record<string, string> = {}) {
  const outs: string[] = [];
  const env: Record<string, string | undefined> = { DIGEST_UNSUBSCRIBE_SECRET: secret ?? undefined, SCHEDULER_SECRET: SECRET, SUPABASE_URL: "https://x.supabase.co", ...extra };
  return { outs, deps: { env: (n: string) => env[n], optOut: (u: string) => { outs.push(u); return Promise.resolve(); }, log: () => {} } };
}
type Kind = "GET" | "PAGE" | "ONECLICK" | "PUT" | "DELETE";
const link = (u: string, t: string, kind: Kind = "GET") => {
  const url = `${FN}?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`;
  if (kind === "PAGE") return new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "confirm=page" });
  if (kind === "ONECLICK") return new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
  return new Request(url, { method: kind });
};
const PAGE = "https://p-search-mobil.vercel.app/leiratkozas";

Deno.test("unsubscribe: a valid GET only redirects to the confirm page (fragment, nothing changed); the two POSTs opt out", async () => {
  const tA = await unsubscribeToken(USECRET, A);
  const g = unsub();
  const r = await handleUnsubscribe(link(A, tA), g.deps);
  assert.equal(r.status, 302);
  assert.deepEqual(g.outs, [], "a GET (a scanner opening the link) must not unsubscribe");
  const loc = r.headers.get("Location")!;
  assert.ok(loc.startsWith(`${PAGE}#a=`), loc);
  assert.equal(loc.slice(0, loc.indexOf("#")).includes("?"), false, "the id and token are only in the fragment, never in the query");
  const action = decodeURIComponent(loc.slice(loc.indexOf("#a=") + 3));
  assert.equal(action, `${FN}?u=${A}&t=${tA}`);
  assert.match(action, /^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/digest-unsubscribe\?u=[0-9a-fA-F-]{36}&t=[A-Za-z0-9_-]{43}$/, "the page's ACTION_RE accepts it");

  const p = unsub();
  const rp = await handleUnsubscribe(link(A, tA, "PAGE"), p.deps);
  assert.equal(rp.status, 303);
  assert.equal(rp.headers.get("Location"), `${PAGE}?ok=1`);
  assert.deepEqual(p.outs, [A]);

  const o = unsub();
  const ro = await handleUnsubscribe(link(A, tA, "ONECLICK"), o.deps);
  assert.equal(ro.status, 200);
  assert.deepEqual(o.outs, [A]);
});

Deno.test("unsubscribe: every wrong variant changes nothing (GET, the page's POST, the one-click POST)", async () => {
  const tA = await unsubscribeToken(USECRET, A), tB = await unsubscribeToken(USECRET, B);
  const flip = (t: string) => t.slice(0, -1) + (t.endsWith("A") ? "B" : "A");
  const wrong: [string, string][] = [
    [A, tB], [B, tA], [A, flip(tA)], [A, tA.slice(0, -1)], [A, tA + "A"], [A, ""], [A, tA.toLowerCase() === tA ? tA.toUpperCase() : tA.toLowerCase()],
    [A.toUpperCase(), tA], ["not-a-uuid", tA], ["", tA], [`${A} `, tA], [`${A}\n`, tA], [A, ` ${tA}`], [A, await unsubscribeToken("another-secret", A)],
    [A, await unsubscribeToken(SECRET, A)], // made with the scheduler secret: not the links' key
  ];
  for (const kind of ["GET", "PAGE", "ONECLICK"] as Kind[]) {
    for (const [u, t] of wrong) {
      const s = unsub();
      const rr = await handleUnsubscribe(link(u, t, kind), s.deps);
      assert.deepEqual(s.outs, [], `${kind} u=${JSON.stringify(u)} t=${JSON.stringify(t)} must not opt out`);
      if (kind === "GET") assert.equal(rr.headers.get("Location"), `${PAGE}?ok=0`);
      if (kind === "PAGE") assert.deepEqual([rr.status, rr.headers.get("Location")], [303, `${PAGE}?ok=0`]);
      if (kind === "ONECLICK") assert.equal(rr.status, 400);
    }
  }
  for (const secret of ["", null]) {
    for (const kind of ["GET", "PAGE", "ONECLICK"] as Kind[]) {
      const s = unsub(secret);
      await handleUnsubscribe(link(A, tA, kind), s.deps);
      assert.deepEqual(s.outs, [], `no unsubscribe key (${JSON.stringify(secret)}) must never validate (${kind})`);
    }
  }
  const m = unsub();
  assert.equal((await handleUnsubscribe(link(A, tA, "PUT"), m.deps)).status, 405);
  assert.equal((await handleUnsubscribe(link(A, tA, "DELETE"), m.deps)).status, 405);
  assert.deepEqual(m.outs, []);
});

Deno.test("rotating the scheduler secret does not break the links already sent", async () => {
  const tA = await unsubscribeToken(USECRET, A);
  const s = unsub(USECRET, { SCHEDULER_SECRET: "a-brand-new-scheduler-secret" });
  assert.equal((await handleUnsubscribe(link(A, tA, "ONECLICK"), s.deps)).status, 200);
  assert.deepEqual(s.outs, [A]);
});

Deno.test("a failing update: the page gets ok=0 (303), the one-click 500, the GET still changes nothing", async () => {
  const tA = await unsubscribeToken(USECRET, A);
  const failing = (kind: Kind) => {
    const d = unsub();
    return handleUnsubscribe(link(A, tA, kind), { ...d.deps, optOut: () => Promise.reject(new Error("db")) });
  };
  const page = await failing("PAGE");
  assert.deepEqual([page.status, page.headers.get("Location")], [303, `${PAGE}?ok=0`]);
  assert.equal((await failing("ONECLICK")).status, 500);
  assert.ok((await failing("GET")).headers.get("Location")!.startsWith(`${PAGE}#a=`));
});

Deno.test("the unsubscribe token is only an HMAC of the user id: it does not contain the secret and is not the secret's prefix", async () => {
  const t = await unsubscribeToken(SECRET, A);
  assert.equal(t.includes(SECRET), false);
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(await unsubscribeToken(SECRET, A), await unsubscribeToken(SECRET, B));
  assert.notEqual(await unsubscribeToken(SECRET, A), await unsubscribeToken(SECRET + "x", A));
  assert.equal(await unsubscribeToken(SECRET, A), await unsubscribeToken(SECRET, A)); // stable
  assert.equal(await verifyUnsubscribeToken("", A, t), false);
  assert.equal(await verifyUnsubscribeToken(SECRET, "", t), false);
});
