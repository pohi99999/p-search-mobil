import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { formatAmountHu, formatDeadlineHu } from './grant-text.ts';
import { formatGrantAmount } from '../../../src/lib/grantAmount.ts';

// Brunella 4853 (a): the date by the 4738 convention, Budapest midnight = that day.
Deno.test('deadline: the Budapest day, not the UTC date of the stored instant', () => {
  assertEquals(formatDeadlineHu('2026-12-01T23:00:00Z'), '2026. 12. 02.'); // BAY_VOUCHER, winter time
  assertEquals(formatDeadlineHu('2029-12-30T23:00:00+00:00'), '2029. 12. 31.'); // DIMOP_PLUSZ-1.2.3/B1-24
  assertEquals(formatDeadlineHu('2027-06-29T22:00:00Z'), '2027. 06. 30.'); // GINOP_PLUSZ-1.4.3-24, summer time
});

Deno.test('deadline: a real time of day is kept after the date; none or unreadable is null', () => {
  assertEquals(formatDeadlineHu('2026-06-30T16:00:00Z'), '2026. 06. 30. 18:00'); // DIMOP C-26 closes at 18:00
  assertEquals(formatDeadlineHu(null), null);
  assertEquals(formatDeadlineHu(''), null);
  assertEquals(formatDeadlineHu('nem dátum'), null);
});

Deno.test('amount: the same line as the app card for every case', () => {
  const cases: [number | null, number | null][] = [
    [1, 138_937_500_000], [5_000_000, 150_000_000], [1, 150_000_000], [5_000_000, null],
    [null, null], [0, 0], [3_000_000, 3_000_000], [5_000_000, 20_000_000_000],
  ];
  for (const [min, max] of cases) assertEquals(formatAmountHu(min, max), formatGrantAmount(min, max), `${min} / ${max}`);
  assertEquals(formatAmountHu(1, 138_937_500_000), 'keretösszeg 138 937 500 000 Ft');
});
