import { assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// P-Search kör 2 (Irisz P1-1): the plan prompt is built inside the handler, so this guards the wiring: the grant
// part is planGrantSection() (amount, deadline, eligibility, the timing rule; tested in _shared), not the old
// title + description lines that left the deadline and the amount out.
Deno.test("the action-plan prompt takes the grant from planGrantSection, not from title and description alone", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(/\$\{planGrantSection\(grantData\)\}/.test(src), "planGrantSection(grantData) is not in the prompt");
  assert(!/- Cím: \$\{grantData\.title\}/.test(src), "the old title-only grant line is back");
});
