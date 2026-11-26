// The weekly digest's pure core (round 6, item A).
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DIGEST_MAX_ITEMS,
  isEmptyDigest,
  isSendSlot,
  isoWeekKey,
  parseAllowlist,
  isAllowed,
  renderDigest,
  selectDigestItems,
  sentThisWeek,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
  type DigestGrant,
  type DigestMatch,
  collectPages,
} from "./digest.ts";

// --- the send slot: Monday 07:xx Budapest, whichever UTC run that is -------------------------------------------

Deno.test("winter time (CET, UTC+1): the 06:00 UTC run sends, the 05:00 UTC run does not", () => {
  assertEquals(isSendSlot(new Date("2026-11-30T06:00:00Z")), true); // Monday 07:00 Budapest
  assertEquals(isSendSlot(new Date("2026-11-30T05:00:00Z")), false); // Monday 06:00 Budapest
});

Deno.test("summer time (CEST, UTC+2): the 05:00 UTC run sends, the 06:00 UTC run does not", () => {
  assertEquals(isSendSlot(new Date("2026-06-01T05:00:00Z")), true); // Monday 07:00 Budapest
  assertEquals(isSendSlot(new Date("2026-06-01T06:00:00Z")), false); // Monday 08:00 Budapest
});

Deno.test("not on another day, even at 7 o'clock", () => {
  assertEquals(isSendSlot(new Date("2026-12-01T06:00:00Z")), false); // Tuesday 07:00 Budapest
});

// --- one digest a week -----------------------------------------------------------------------------------------

Deno.test("isoWeekKey: the local date decides (a Sunday 23:30 UTC is already Monday in Budapest)", () => {
  assertEquals(isoWeekKey(new Date("2026-11-30T06:00:00Z")), "2026-W49");
  assertEquals(isoWeekKey(new Date("2026-11-29T23:30:00Z")), "2026-W49");
  assertEquals(isoWeekKey(new Date("2026-11-29T22:30:00Z")), "2026-W48");
  assertEquals(isoWeekKey(new Date("2027-01-01T12:00:00Z")), "2026-W53");
});

Deno.test("sentThisWeek: the same local week yes, the previous week or never no", () => {
  const now = new Date("2026-11-30T06:00:00Z");
  assertEquals(sentThisWeek("2026-11-30T05:00:00Z", now), true);
  assertEquals(sentThisWeek("2026-11-23T06:00:00Z", now), false);
  assertEquals(sentThisWeek(null, now), false);
  assertEquals(sentThisWeek("not a date", now), false);
});

// --- who may get one -------------------------------------------------------------------------------------------

Deno.test("the allowlist: unset or empty is nobody, '*' is everyone opted in, ids are exact", () => {
  assertEquals(isAllowed(parseAllowlist(undefined), "u1"), false);
  assertEquals(isAllowed(parseAllowlist("   "), "u1"), false);
  assertEquals(isAllowed(parseAllowlist("*"), "anyone"), true);
  const list = parseAllowlist(" u1 , u2,");
  assertEquals([isAllowed(list, "u1"), isAllowed(list, "u2"), isAllowed(list, "u3")], [true, true, false]);
});

// --- the unsubscribe token -------------------------------------------------------------------------------------

Deno.test("the token verifies for its user and secret only", async () => {
  const t = await unsubscribeToken("secret-1", "user-a");
  assertEquals(t.length, 43);
  assert(/^[A-Za-z0-9_-]+$/.test(t));
  assertEquals(await verifyUnsubscribeToken("secret-1", "user-a", t), true);
  assertEquals(await verifyUnsubscribeToken("secret-1", "user-b", t), false);
  assertEquals(await verifyUnsubscribeToken("secret-2", "user-a", t), false);
  assertEquals(await verifyUnsubscribeToken("secret-1", "user-a", t.slice(0, -1)), false);
  assertEquals(await verifyUnsubscribeToken("", "user-a", t), false);
  assertEquals(await verifyUnsubscribeToken("secret-1", "user-a", ""), false);
});

Deno.test("the unsubscribe URL carries the user and the token, on the function path", () => {
  const u = new URL(unsubscribeUrl("https://x.supabase.co/", "user-a", "tok"));
  assertEquals(u.pathname, "/functions/v1/digest-unsubscribe");
  assertEquals([u.searchParams.get("u"), u.searchParams.get("t")], ["user-a", "tok"]);
});

// --- what goes into a digest -----------------------------------------------------------------------------------

const NOW = new Date("2026-11-30T06:00:00Z"); // Monday 07:00 Budapest
const SINCE = new Date("2026-11-23T06:00:00Z");
const day = (n: number) => new Date(Date.parse("2026-11-30T12:00:00Z") + n * 86400000).toISOString();
const grant = (id: string, over: Partial<DigestGrant> = {}): DigestGrant => ({
  id, title: `Pályázat ${id}`, amount_min: 1_000_000, amount_max: 5_000_000, deadline: day(60), source_closed_at: null, ...over,
});
const match = (id: string, score: number, created: string, g: DigestGrant, status = "new"): DigestMatch => ({
  id, match_score: score, status, created_at: created, grants: g,
});

Deno.test("new matches: only since the last digest, visible ones only, best first, at most five", () => {
  const recent = "2026-11-28T10:00:00Z";
  const old = "2026-11-20T10:00:00Z";
  const matches = [
    match("m1", 70, recent, grant("g1")),
    match("m2", 90, recent, grant("g2")),
    match("m3", 49, recent, grant("g3")), // below the threshold
    match("m4", 80, old, grant("g4")), // before the last digest
    match("m5", 85, recent, grant("g5"), "stale"),
    match("m6", 75, recent, grant("g6", { title: "Klaszter minősítés", amount_min: null, amount_max: null })), // not money
    match("m7", 60, recent, grant("g7", { deadline: day(-2) })), // expired
    match("m8", 65, recent, grant("g8", { source_closed_at: "2026-11-29T00:00:00Z" })), // closed at the source
  ];
  const items = selectDigestItems({ matches, followed: [], since: SINCE, now: NOW });
  assertEquals(items.newMatches.map((m) => m.id), ["m2", "m1"]);
});

Deno.test("at most five new matches", () => {
  const matches = Array.from({ length: 8 }, (_, i) => match(`m${i}`, 50 + i, "2026-11-28T10:00:00Z", grant(`g${i}`)));
  assertEquals(selectDigestItems({ matches, followed: [], since: SINCE, now: NOW }).newMatches.length, DIGEST_MAX_ITEMS);
});

Deno.test("deadlines: followed and visible grants due within 14 days, nearest first, once each; today still counts", () => {
  const followed = [
    grant("f1", { deadline: day(10) }),
    grant("f2", { deadline: day(20) }), // too far
    grant("f3", { deadline: day(0) }), // today
    grant("g1", { deadline: day(3) }), // also a match: once
  ];
  const matches = [match("m1", 70, "2026-11-01T00:00:00Z", grant("g1", { deadline: day(3) }))];
  const items = selectDigestItems({ matches, followed, since: SINCE, now: NOW });
  assertEquals(items.deadlines.map((g) => g.id), ["f3", "g1", "f1"]);
});

Deno.test("an empty week is an empty digest (no e-mail)", () => {
  const items = selectDigestItems({ matches: [match("m1", 70, "2026-11-01T00:00:00Z", grant("g1"))], followed: [], since: SINCE, now: NOW });
  assertEquals(isEmptyDigest(items), true);
});

// --- the text --------------------------------------------------------------------------------------------------

Deno.test("the text: greeting, both parts, the official-call note, why you get it, and the unsubscribe link", () => {
  const items = {
    newMatches: [match("m1", 72, "2026-11-28T10:00:00Z", grant("g1", { title: "KKV <Technológia> Plusz" }))],
    deadlines: [grant("f1", { deadline: day(5) })],
  };
  const out = renderDigest({ companyName: "Teszt Kft.", items, appUrl: "https://app.example", unsubscribeUrl: "https://x/unsub?u=a&t=b" });
  assertEquals(out.subject, "P-Search: 1 új, a cégedhez illő pályázat");
  for (const part of [out.text, out.html]) {
    assert(part.includes("Kedves Teszt Kft.!"));
    assert(part.includes("egyezés: 72%"));
    assert(part.includes("Közelgő határidők"));
    assert(part.includes("a hivatalos kiírás a mérvadó"));
    assert(part.includes("kérted a heti összefoglalót"));
  }
  assert(out.text.includes("https://x/unsub?u=a&t=b"));
  assert(out.html.includes('href="https://x/unsub?u=a&amp;t=b"'));
  // HTML-escaped title, no em dash anywhere (the outgoing-copy rule)
  assert(out.html.includes("KKV &lt;Technológia&gt; Plusz"));
  assert(!out.html.includes("<Technológia>"));
  assert(!out.text.includes("—") && !out.html.includes("—"));
});

Deno.test("the subject without new matches names the deadlines", () => {
  const out = renderDigest({ companyName: null, items: { newMatches: [], deadlines: [grant("f1", { deadline: day(2) })] }, appUrl: "a", unsubscribeUrl: "u" });
  assertEquals(out.subject, "P-Search: közelgő pályázati határidők");
  assert(out.text.startsWith("Kedves Felhasználó!"));
});

// --- collectPages: every opted-in user, ordered, page by page (Ellenőr 9371, tip 2) ---------------------------------

function pagedSource(n: number) {
  const rows = Array.from({ length: n }, (_, i) => i);
  const calls: [number, number][] = [];
  return { calls, fetch: (from: number, to: number) => (calls.push([from, to]), Promise.resolve(rows.slice(from, to + 1))) };
}

Deno.test("collectPages reads every row exactly once across pages, with inclusive ranges", async () => {
  for (const n of [0, 1, 499, 500, 501, 1000, 1234]) {
    const src = pagedSource(n);
    const all = await collectPages(src.fetch, 500);
    assertEquals(all, Array.from({ length: n }, (_, i) => i), `n=${n}`);
    assertEquals(src.calls[0], [0, 499]);
    if (n >= 500) assertEquals(src.calls[1], [500, 999]);
    assertEquals(src.calls.length, Math.floor(n / 500) + 1, `n=${n}: stops at the first short page`);
  }
});

Deno.test("collectPages refuses to return a part: past maxPages it throws", async () => {
  const src = pagedSource(10_000);
  await assertRejects(() => collectPages(src.fetch, 500, 3), Error, "more than 1500 rows");
  assertEquals(src.calls.length, 3);
});

Deno.test("collectPages passes a page error up (no silent partial list)", async () => {
  let n = 0;
  await assertRejects(() => collectPages(() => (++n === 2 ? Promise.reject(new Error("db")) : Promise.resolve(Array(500).fill(0))), 500), Error, "db");
});
