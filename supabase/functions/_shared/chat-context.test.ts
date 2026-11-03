import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  buildChatSystemPrompt,
  buildRagContext,
  chatGrantContext,
  type ChatGrant,
  isGrantOpen,
  type RagChunk,
  profileAskRule,
  TEGEZES_RULE,
} from './chat-context.ts';
import { companyContext } from './company-context.ts';

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
  assert(sample.includes('Szeretnéd'), sample);
  // \b is ASCII-only in JS ("tudná" would match inside "tudnád"), so the word edges are Unicode letters.
  assert(!/(?<!\p{L})(Ön|Önnek|tudná|adja meg|kérem)(?!\p{L})/u.test(sample), sample);
  assert(!/Aktuálisan tárgyalt pályázat adatai|Tudásbázisból/.test(p), 'empty blocks are left out');
});

// Profile (Lumen's evening check 4925): 5 employees and 50 M Ft in the profile, yet the reply asked for both.
const FOUR = 'cégforma, éves árbevétel, aktuális foglalkoztatotti létszám és székhely/telephely régió';
const LUMEN = { company_name: 'Teszt Kft', employee_count: 5, yearly_revenue: 50_000_000, industry_code: null, goals: null };
const promptFor = (profile: typeof LUMEN | null) =>
  buildChatSystemPrompt({ company: profile ? companyContext(profile) : '', grant: '', rag: '', tasks: '', profile });

Deno.test('filled profile: revenue and headcount are given, not asked again', () => {
  const p = promptFor(LUMEN);
  assert(p.includes('Alkalmazottak száma: 5 fő'), p);
  assert(p.includes('Éves árbevétel: 50 000 000 Ft'), p);
  assert(!p.includes('Nincs megadva'), p);
  assert(!p.includes(FOUR), 'the four-item ask list is gone');
  const rule = profileAskRule(LUMEN);
  assert(rule.includes('a hiányzó kulcsfontosságú részletekre: cégforma és székhely/telephely régió.'), rule);
  assert(rule.includes('már szerepel a foglalkoztatotti létszám és az éves árbevétel: ezeket ne kérdezd meg újra'), rule);
  assert(p.includes(rule));
});

Deno.test('empty profile: the missing data is still asked for', () => {
  for (const profile of [null, { ...LUMEN, employee_count: null, yearly_revenue: null }, { ...LUMEN, employee_count: 0, yearly_revenue: 0 }]) {
    const rule = profileAskRule(profile);
    assert(rule.includes(`a hiányzó kulcsfontosságú részletekre: ${FOUR}.`), rule);
    assert(!rule.includes('ne kérdezd meg újra'), rule);
    assert(promptFor(profile as typeof LUMEN | null).includes(rule));
  }
});

Deno.test('half-filled profile: only the missing one is asked for', () => {
  const rule = profileAskRule({ ...LUMEN, employee_count: null });
  assert(rule.includes('részletekre: cégforma, aktuális foglalkoztatotti létszám és székhely/telephely régió.'), rule);
  // one given field: singular "ezt", not "ezeket"
  assert(rule.includes('már szerepel az éves árbevétel: ezt ne kérdezd meg újra, és ne sorold fel bekérendő adatként, hanem használd.'), rule);
  assert(!rule.includes('ezeket') && !rule.includes('őket'), rule);
});

Deno.test('one field given (only the headcount): the rule speaks of it in the singular', () => {
  const rule = profileAskRule({ ...LUMEN, yearly_revenue: null });
  assert(rule.includes('részletekre: cégforma, éves árbevétel és székhely/telephely régió.'), rule);
  assert(rule.includes('már szerepel a foglalkoztatotti létszám: ezt ne kérdezd meg újra'), rule);
  assert(!rule.includes('ezeket') && !rule.includes('őket'), rule);
});

Deno.test('both fields given: the plural stays', () => {
  const rule = profileAskRule(LUMEN);
  assert(rule.endsWith('ezeket ne kérdezd meg újra, és ne sorold fel bekérendő adatként, hanem használd őket.'), rule);
});

Deno.test('the sample reply asks for no company data', () => {
  const p = promptFor(LUMEN);
  const sample = p.slice(p.indexOf('Példa a kimenetre:'));
  assert(!/árbevétel|cég formáj|cégform/.test(sample), sample);
});
