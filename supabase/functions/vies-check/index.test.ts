// Deno tests for vies-check (kanban eeac42d8, B2/3). Both directions: a
// registered VAT id pre-fills, an unknown one does not, and VIES trouble
// never turns into an error for the client.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handler, normalizeHuTaxNumber, type CreateClientFn, type FetchFn } from "./index.ts";

Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_ANON_KEY", "anon");

const authedClient = ((_u: string, _k: string) => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) } })) as unknown as CreateClientFn;
const noUserClient = ((_u: string, _k: string) => ({ auth: { getUser: async () => ({ data: { user: null }, error: { message: "bad" } }) } })) as unknown as CreateClientFn;

function viesFetch(reply: unknown, status = 200, calls: string[] = []): FetchFn {
  return ((input: string | URL | Request, init?: RequestInit) => {
    calls.push(String(init?.body ?? ""));
    return Promise.resolve(new Response(JSON.stringify(reply), { status, headers: { "Content-Type": "application/json" } }));
  }) as unknown as FetchFn;
}
const req = (body: unknown, auth = "Bearer t") => new Request("http://localhost/vies-check", { method: "POST", headers: auth ? { Authorization: auth, "Content-Type": "application/json" } : {}, body: JSON.stringify(body) });

Deno.test("normalizeHuTaxNumber: strips HU prefix, separators and the -2-44 suffix; rejects short input", () => {
  assertEquals(normalizeHuTaxNumber("10773381-2-44"), "10773381");
  assertEquals(normalizeHuTaxNumber("HU 10773381"), "10773381");
  assertEquals(normalizeHuTaxNumber("10 773 381"), "10773381");
  assertEquals(normalizeHuTaxNumber("1234567"), null);
  assertEquals(normalizeHuTaxNumber(12345678), null);
});

Deno.test("vies-check: no auth -> 401, VIES never called", async () => {
  const calls: string[] = [];
  const res = await handler(req({ tax_number: "10773381" }, ""), { createClient: noUserClient, fetch: viesFetch({}, 200, calls) });
  assertEquals(res.status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("vies-check: short tax number -> 400, VIES never called", async () => {
  const calls: string[] = [];
  const res = await handler(req({ tax_number: "123" }), { createClient: authedClient, fetch: viesFetch({}, 200, calls) });
  assertEquals(res.status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("vies-check: registered VAT id -> found:true with name and address, HU + 8 digits sent to VIES", async () => {
  const calls: string[] = [];
  const res = await handler(req({ tax_number: "10773381-2-44" }), {
    createClient: authedClient,
    fetch: viesFetch({ valid: true, name: "MAGYAR TELEKOM  NYRT", address: "KONYVES KALMAN KÖRÚT 36 1097 BUDAPEST", userError: null }, 200, calls),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body, { found: true, vat: "HU10773381", name: "MAGYAR TELEKOM NYRT", address: "KONYVES KALMAN KÖRÚT 36 1097 BUDAPEST" });
  assertEquals(JSON.parse(calls[0]), { countryCode: "HU", vatNumber: "10773381" });
});

Deno.test("vies-check: unknown VAT id -> found:false, placeholders '---' are not returned as values", async () => {
  const res = await handler(req({ tax_number: "12345678" }), { createClient: authedClient, fetch: viesFetch({ valid: false, name: "---", address: "---", userError: null }) });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body, { found: false, vat: "HU12345678", name: null, address: null, reason: "invalid" });
});

Deno.test("vies-check: VIES 5xx or unreachable -> 200 found:false (never blocks registration)", async () => {
  const r1 = await handler(req({ tax_number: "10773381" }), { createClient: authedClient, fetch: viesFetch({}, 503) });
  assertEquals((await r1.json()).reason, "vies_503");
  const throwing = (() => Promise.reject(new TypeError("dns"))) as unknown as FetchFn;
  const r2 = await handler(req({ tax_number: "10773381" }), { createClient: authedClient, fetch: throwing });
  assertEquals(r2.status, 200);
  assertEquals((await r2.json()).reason, "unreachable");
});
