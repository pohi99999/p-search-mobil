// Run with: deno test --allow-read supabase/functions/_shared/
// Both directions: the summary names keys and sizes, and never the content;
// the source guard fails if chat-with-gemini logs the raw body again.
import { assertEquals, assertStringIncludes, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { describeRequestData, describeText, describeJsonText, describeParseError } from "./request-log.ts";

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

// The request body was only half the leak: the user's message and the model's
// answer were logged too. This guard covers every sensitive value, not just
// the body, and it reads whole console calls because several span lines.
Deno.test("chat-with-gemini logs no sensitive value raw", async () => {
  const src = await Deno.readTextFile(new URL("../chat-with-gemini/index.ts", import.meta.url));
  const lines = src.split("\n");
  const calls: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/console\.(log|info|debug|warn|error)\(/.test(lines[i])) continue;
    let block = lines[i];
    let depth = (block.match(/\(/g) ?? []).length - (block.match(/\)/g) ?? []).length;
    while (depth > 0 && i + 1 < lines.length) {
      i++;
      block += "\n" + lines[i];
      depth += (lines[i].match(/\(/g) ?? []).length - (lines[i].match(/\)/g) ?? []).length;
    }
    calls.push(block);
  }
  const sensitive = /\b(message|reply|replyJSONText|updates|requestData)\b/g;
  const offending: string[] = [];
  for (const call of calls) {
    // A `${...}` span is code even though it sits inside a template literal,
    // so it must NOT be excused by the "inside a string" rule -- the line
    // console.log(`prompt: "${message}"`) is exactly the leak we guard against.
    const interpolations: Array<[number, number]> = [];
    for (const i of call.matchAll(/\$\{[^}]*\}/g)) {
      interpolations.push([i.index!, i.index! + i[0].length]);
    }
    for (const m of call.matchAll(sensitive)) {
      const at = m.index!;
      const inInterpolation = interpolations.some(([a, b]) => at >= a && at < b);
      const before = call.slice(0, at);
      // Allowed only as the direct argument of a describe* helper.
      if (/describe\w*\(\s*$/.test(before)) continue;
      // Prose inside a quoted string is fine ("message/prompt paraméter
      // hiányzik"), but only when it is not an interpolated value.
      if (!inInterpolation && /['"`][^'"`]*$/.test(before)) continue;
      offending.push(`${m[0]} in: ${call.replace(/\s+/g, " ").slice(0, 90)}`);
    }
  }
  assertEquals(offending, [], `sensitive value logged raw:\n${offending.join("\n")}`);
});

Deno.test("describeText reports length, never characters", () => {
  const secret = "A cegem NAV-tartozasa 3,2 millio forint";
  const out = describeText(secret);
  assertEquals(out, `string(${secret.length})`);
  assert(!out.includes("NAV") && !out.includes("cegem"), "content leaked");
  assertEquals(describeText(null), "(null)");
  assertEquals(describeText(undefined), "(undefined)");
});

Deno.test("describeJsonText reports size and OUR keys, never the values", () => {
  const payload = JSON.stringify({
    reply: "A NAV-tartozas rendezve, 3,2 millio",
    profile_updates: { revenue: 120000000 },
  });
  const out = describeJsonText(payload);
  assertStringIncludes(out, `string(${payload.length})`);
  assertStringIncludes(out, "keys: reply, profile_updates");
  assert(!out.includes("NAV") && !out.includes("120000000"), "content leaked");
});

Deno.test("describeJsonText survives a non-JSON answer without quoting it", () => {
  const prose = "Sajnalom, a cege NAV-tartozasa miatt nem tudok valaszolni.";
  const out = describeJsonText(prose);
  assertEquals(out, `string(${prose.length}), not valid JSON`);
  assert(!out.includes("NAV"), "content leaked");
});

// Measured on V8: JSON.parse embeds the first characters of its input in the
// error message -- `Unexpected token 'A', "A cegem NA"... is not valid JSON`.
// Logging the message would therefore leak content on the error path.
Deno.test("describeParseError drops the snippet V8 puts in the message", () => {
  const prose = "A cegem NAV-tartozasa 3,2 millio forint";
  let caught: unknown;
  try {
    JSON.parse(prose);
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof Error, "expected a SyntaxError");
  assertStringIncludes((caught as Error).message, "A cegem NA");

  const out = describeParseError(caught);
  assertStringIncludes(out, "SyntaxError");
  assert(!out.includes("A cegem"), "the snippet survived into the log line");
  assert(!out.includes("NAV"), "content leaked");
});
