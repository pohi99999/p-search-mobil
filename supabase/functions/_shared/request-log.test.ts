// Run with: deno test --allow-read supabase/functions/_shared/
// Both directions: the summary names keys and sizes, and never the content;
// the source guard fails if chat-with-gemini logs the raw body again.
import { assertEquals, assertStringIncludes, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { describeRequestData } from "./request-log.ts";

Deno.test("describes keys and sizes, never values", () => {
  const secretish = "Cegem NAV-tartozasa 3,2 millio, jelszo: Titok123";
  const out = describeRequestData({ prompt: secretish, history: [{ role: "user" }, { role: "model" }], business_profile_id: "abc-123", flag: true });
  assertEquals(out, `prompt:string(${secretish.length}), history:array(2), business_profile_id:string(7), flag:boolean`);
  assert(!out.includes("Titok123") && !out.includes("NAV"), "content leaked into the summary");
});

Deno.test("handles non-object bodies", () => {
  assertEquals(describeRequestData(null), "(null)");
  assertEquals(describeRequestData("x".repeat(5)), "string(5)");
  assertEquals(describeRequestData([1, 2, 3]), "array(3)");
  assertEquals(describeRequestData({}), "(empty object)");
});

Deno.test("chat-with-gemini never logs the raw request body", async () => {
  const src = await Deno.readTextFile(new URL("../chat-with-gemini/index.ts", import.meta.url));
  const offending = src.split("\n").filter((l) => /console\.(log|info|debug|error)\(/.test(l) && /JSON\.stringify\(requestData\)|,\s*requestData\s*[,)]/.test(l));
  assertEquals(offending, [], `raw body logged: ${offending.join(" | ")}`);
  assertStringIncludes(src, "describeRequestData(requestData)");
});
