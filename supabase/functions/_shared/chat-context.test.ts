import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  buildChatSystemPrompt,
  buildRagContext,
  chatGrantContext,
  type ChatGrant,
  isGrantOpen,
  type RagChunk,
  TEGEZES_RULE,
} from './chat-context.ts';

// Copilot card (vc 18 E2E, Lumen 4800; Brunella 4802/4853).
const CUTOFF = '2026-10-24T22:00:00.000Z'; // Budapest 2026-10-25 00:00
const BAY: ChatGrant = { id: 'bay', title: 'BAY_VOUCHER', deadline: '2026-12-01T23:00:00Z', amount_min: 1, amount_max: 138_937_500_000 };
const grants = new Map<string, ChatGrant>([
  ['bay', BAY],
  ['tent', { id: 'tent', title: 'TEN-T vasúti és regionális intermodális közlekedés', deadline: '2027-03-31T22:00:00Z' }],
  ['geo', { id: 'geo', title: 'Geotermikus alapú villamosenergia-termelés', deadline: '2027-01-31T23:00:00Z' }],
  ['dimop', { id: 'dimop', title: 'DIMOP Plusz digitalizáció', deadline: '2029-12-30T23:00:00Z' }],
  ['expired', { id: 'expired', title: 'Lejárt pályázat', deadline: '2026-10-23T22:00:00Z' }],
  ['closed', { id: 'closed', title: 'Forráson lezárt pályázat', deadline: '2027-06-29T22:00:00Z', source_closed_at: '2026-10-25T08:00:00Z' }],
]);
const hit = (grant_id: string, similarity: number, content = `${grant_id} részlet`): RagChunk => ({ grant_id, similarity, content, grant_title: grants.get(grant_id)?.title });

Deno.test('the E2E case: a BAY question brings BAY only, not TEN-T or geothermal, however similar they score', () => {
  // Live 2026-10-25 the foreign hits scored 0.65-0.78, above any usable threshold.
  const r = buildRagContext({
    own: { title: 'BAY_VOUCHER', chunks: ['A pályázat beadási határideje 2026.12.02.'] },
    hits: [hit('tent', 0.78), hit('geo', 0.68), hit('dimop', 0.7)],
    grants, cutoffIso: CUTOFF,
  });
  assertEquals(r.sources, ['BAY_VOUCHER']);
  assertEquals(r.similarCount, 0);
  assert(r.text.startsWith('A TÁRGYALT PÁLYÁZAT (BAY_VOUCHER) KIÍRÁSÁNAK RÉSZLETEI'), r.text);
  assert(!/TEN-T|Geotermikus|DIMOP/.test(r.text), r.text);
});

Deno.test('with a match but no chunks of its own: the grant is still the only source, no empty block', () => {
  const r = buildRagContext({ own: { title: 'EFOP_PLUSZ-4.1.2-25', chunks: [] }, hits: [hit('dimop', 0.9)], grants, cutoffIso: CUTOFF });
  assertEquals(r.sources, ['EFOP_PLUSZ-4.1.2-25']);
  assertEquals(r.text, '');
});

Deno.test('without a match: open grants only, unknown and under-threshold hits dropped, at most five', () => {
  const r = buildRagContext({
    own: null,
    hits: [hit('expired', 0.9), hit('closed', 0.9), hit('unknown', 0.9), hit('dimop', 0.7), hit('tent', 0.6), hit('geo', 0.29)],
    grants, cutoffIso: CUTOFF,
  });
  assertEquals(r.sources, ['DIMOP Plusz digitalizáció', 'TEN-T vasúti és regionális intermodális közlekedés']);
  assert(r.text.startsWith('RELEVÁNS, MÉG NYITOTT PÁLYÁZATOK'), r.text);
  assert(r.text.includes('(beadási határidő: 2029. 12. 31.)'), r.text);
  assert(!/Lejárt|lezárt|unknown|Geotermikus/.test(r.text), r.text);
  const many = buildRagContext({ own: null, hits: Array.from({ length: 8 }, () => hit('dimop', 0.7)), grants, cutoffIso: CUTOFF });
  assertEquals(many.similarCount, 5);
});

Deno.test('open: from the Budapest day start on, no deadline is open, closed at the source is not', () => {
  assert(isGrantOpen({ deadline: CUTOFF }, CUTOFF), 'a deadline today is still open');
  assert(!isGrantOpen({ deadline: '2026-10-24T21:59:59Z' }, CUTOFF), 'yesterday is closed');
  assert(isGrantOpen({ deadline: null }, CUTOFF));
  assert(!isGrantOpen({ deadline: '2030-01-01T00:00:00Z', source_closed_at: '2026-10-25T08:00:00Z' }, CUTOFF));
});

Deno.test('grant context: the BAY deadline is the Budapest day, the amount as on the card', () => {
  const g = chatGrantContext(BAY);
  assert(g.includes('Beadási határidő: 2026. 12. 02.'), g);
  assert(g.includes('Támogatás: keretösszeg 138 937 500 000 Ft'), g);
  assert(!/T23:00|1 Ft/.test(g), g);
  assert(chatGrantContext({ title: 'X' }).includes('Beadási határidő: a kiírás nem ad meg határidőt'));
});

Deno.test('the prompt asks for tegezés, and its sample reply uses it', () => {
  const p = buildChatSystemPrompt({ company: '', grant: '', rag: '', tasks: '' });
  assert(p.includes(TEGEZES_RULE));
  const sample = p.slice(p.indexOf('Példa a kimenetre:'));
  assert(sample.includes('meg tudnád adni'), sample);
  // \b is ASCII-only in JS ("tudná" would match inside "tudnád"), so the word edges are Unicode letters.
  assert(!/(?<!\p{L})(Ön|Önnek|tudná|adja meg|kérem)(?!\p{L})/u.test(sample), sample);
  assert(!/Aktuálisan tárgyalt pályázat adatai|Tudásbázisból/.test(p), 'empty blocks are left out');
});
