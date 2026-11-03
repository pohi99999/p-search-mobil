import { assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// P-Search kör 2, P1-5: the handler is one serve() block, so this guards the wiring of the daily OCR cap: consumed
// after the owner check and before the paid vision call, answered with its own status, given back only when the
// vision call did not run through.
Deno.test("the OCR cap is consumed before the vision call and refunded only when it did not run", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const owner = src.indexOf("Profil tulajdonos ellenőrizve.");
  const consume = src.indexOf("await consumeDailyOcr(supabaseAdmin, user.id)");
  const vision = src.indexOf("await extractJson(");
  const ran = src.indexOf("ocrRan = true;");
  assert(owner > 0 && consume > owner, "consumed after the owner check");
  assert(vision > consume, "consumed before the paid vision call");
  assert(ran > vision, "ocrRan is set after the vision call returned");
  assert(/if \(!ocrGate\.allowed\) \{\s*return new Response\(JSON\.stringify\(ocrGate\.body\), \{\s*status: ocrGate\.status/.test(src), "the gate's own answer is returned");
  assert(/if \(ocrCapUser && !ocrRan\) await refundDailyOcr\(supabaseAdmin, ocrCapUser\);/.test(src), "refund only when the OCR did not run");
});
