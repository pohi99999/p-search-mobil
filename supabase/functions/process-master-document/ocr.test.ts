import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { extractedLog, ocrAnswerLog, parseOcrJson } from "./ocr.ts";

// P-Search kör 2 (Kenshin P1-4): a financial statement's text and figures never reach the function log.
const SECRET = "Árbevétel 987654321 Ft, Titkos Kft";

Deno.test("parseOcrJson reads the figures from a JSON answer", () => {
  assertEquals(parseOcrJson(' {"net_revenue": 987654321, "employee_count": 12} '), { net_revenue: 987654321, employee_count: 12 });
});

Deno.test("a broken or non-object answer throws a message that names only the size, never the text", () => {
  const err = assertThrows(() => parseOcrJson(`Itt a beszámoló: ${SECRET}`));
  assert(!String((err as Error).message).includes("987654321"), (err as Error).message);
  assert(!String((err as Error).message).includes("Titkos"), (err as Error).message);
  assert(/string\(\d+\)/.test((err as Error).message), (err as Error).message);
  assertThrows(() => parseOcrJson("[1,2]"), Error, "nem JSON-objektum");
});

Deno.test("the log lines carry sizes and field names, not values", () => {
  const raw = JSON.stringify({ net_revenue: 987654321, company: "Titkos Kft" });
  const a = ocrAnswerLog(raw);
  const b = extractedLog({ net_revenue: 987654321, company: "Titkos Kft" });
  for (const line of [a, b]) {
    assert(!line.includes("987654321") && !line.includes("Titkos"), line);
  }
  assert(b.includes("net_revenue:number") && b.includes("company:string(10)"), b);
});

Deno.test("the handler logs the OCR answer only through these helpers (no raw text, no stringified figures)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  // Every log call that touches the OCR text goes through ocrAnswerLog (sizes only).
  const calls = src.split("\n").filter((l) => /console\.\w+\(/.test(l) && /rawOcrText/.test(l));
  assert(calls.length > 0 && calls.every((l) => /console\.\w+\(ocrAnswerLog\(rawOcrText\)\)/.test(l)), calls.join("\n"));
  assert(!/console\.\w+\([^)]*JSON\.stringify\(extracted\)/.test(src), "the extracted figures are logged");
  assert(!/rawOcrText\.slice/.test(src), "a slice of the OCR text goes into a message");
  assert(!/console\.\w+\(`[^`]*\$\{profile\.company_name\}/.test(src), "the company name is logged");
});
