// Card [H2]: the deadline convention (Budapest midnight that starts the last day), on the live cases of 2026-10-25.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { budapestMidnightIso, normalizeDeadline } from "./deadline-normalize.ts";

Deno.test("Budapest midnight in winter and in summer", () => {
  assertEquals(budapestMidnightIso(2029, 12, 31), "2029-12-30T23:00:00.000Z");
  assertEquals(budapestMidnightIso(2021, 7, 19), "2021-07-18T22:00:00.000Z");
  assertEquals(budapestMidnightIso(2026, 3, 29), "2026-03-28T23:00:00.000Z"); // the day summer time starts
  assertEquals(budapestMidnightIso(2026, 10, 25), "2026-10-24T22:00:00.000Z"); // the day it ends
});

Deno.test("a stored Budapest midnight stays as it is, summer and winter (the 57 good rows)", () => {
  assertEquals(normalizeDeadline("2026-09-30T22:00:00.000Z"), "2026-09-30T22:00:00.000Z");
  assertEquals(normalizeDeadline("2026-12-01T23:00:00Z"), "2026-12-01T23:00:00.000Z"); // BAY_VOUCHER, 12-02
  assertEquals(normalizeDeadline("2029-12-30T23:00:00+00:00"), "2029-12-30T23:00:00.000Z");
});

Deno.test("the source's winter date an hour off (Budapest 23:00) becomes the next day's midnight", () => {
  // DIMOP_PLUSZ-1.2.3/B1-24: source 2029.12.31, stored 2029-12-30 22:00Z
  assertEquals(normalizeDeadline("2029-12-30T22:00:00Z"), "2029-12-30T23:00:00.000Z");
  // GINOP_PLUSZ-1.4.8-24: source 2030.12.31, stored 2030-12-30 22:00Z
  assertEquals(normalizeDeadline("2030-12-30T22:00:00Z"), "2030-12-30T23:00:00.000Z");
});

Deno.test("UTC end of day becomes the Budapest midnight of that UTC date", () => {
  assertEquals(normalizeDeadline("2027-12-31T23:59:59+00:00"), "2027-12-30T23:00:00.000Z");
  assertEquals(normalizeDeadline("2026-07-31T23:59:59.000Z"), "2026-07-30T22:00:00.000Z");
});

Deno.test("a real time of day is kept (DIMOP_PLUSZ-1.2.6/C-26 closes 18:00)", () => {
  assertEquals(normalizeDeadline("2026-06-30T16:00:00Z"), "2026-06-30T16:00:00.000Z");
  assertEquals(normalizeDeadline("2026-11-15T11:00:00Z"), "2026-11-15T11:00:00.000Z");
});

Deno.test("a date alone, in ISO or Hungarian form, is that day's Budapest midnight", () => {
  assertEquals(normalizeDeadline("2029-12-31"), "2029-12-30T23:00:00.000Z");
  assertEquals(normalizeDeadline("2029.12.31."), "2029-12-30T23:00:00.000Z");
  assertEquals(normalizeDeadline("2021. 07. 19."), "2021-07-18T22:00:00.000Z");
});

Deno.test("nothing or something unreadable is null", () => {
  assertEquals(normalizeDeadline(null), null);
  assertEquals(normalizeDeadline(undefined), null);
  assertEquals(normalizeDeadline("  "), null);
  assertEquals(normalizeDeadline("folyamatos"), null);
  assertEquals(normalizeDeadline("2029.13.40."), null);
});
