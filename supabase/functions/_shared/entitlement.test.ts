import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { isPro, FREE_DAILY_SEARCH_CAP } from './entitlement.ts';

Deno.test('isPro: only exactly "pro" is Pro', () => {
  assertEquals(isPro('pro'), true);
  assertEquals(isPro('free'), false);
  assertEquals(isPro(null), false);
  assertEquals(isPro(undefined), false);
  assertEquals(isPro('PRO'), false);
  assertEquals(isPro(''), false);
});

Deno.test('free daily cap is 20', () => {
  assertEquals(FREE_DAILY_SEARCH_CAP, 20);
});
