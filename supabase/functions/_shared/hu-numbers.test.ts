import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { huThousands } from "./hu-numbers.ts";

// Card a96dd8e2 #14 (common test 2026-10-07): the PDF text said "50.000.000 Ft"; Hungarian groups with spaces.
const NB = String.fromCharCode(0xa0); // a no-break space, so the number never breaks across lines in the PDF

Deno.test("dot-grouped amounts become space-grouped", () => {
  assertEquals(huThousands("A támogatás 50.000.000 Ft, a saját erő 1.250.000 Ft."), `A támogatás 50${NB}000${NB}000 Ft, a saját erő 1${NB}250${NB}000 Ft.`);
  assertEquals(huThousands("legalább 2.500 fő"), `legalább 2${NB}500 fő`);
});

Deno.test("dates, decimals, version-like and already correct numbers stay as they are", () => {
  for (const t of ["2025.10.07-ig", "3.14159", "1.5 millió", "v1.2.3", `50${NB}000${NB}000 Ft`, "50 000 000 Ft", "12.34"]) assertEquals(huThousands(t), t);
});
