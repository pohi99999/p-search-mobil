import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { isPro, FREE_DAILY_SEARCH_CAP, FREE_DAILY_CHAT_CAP, effectiveScanFrequency } from './entitlement.ts';

Deno.test('isPro: only exactly "pro" is Pro', () => {
  assertEquals(isPro('pro'), true);
  assertEquals(isPro('free'), false);
  assertEquals(isPro(null), false);
  assertEquals(isPro(undefined), false);
  assertEquals(isPro('PRO'), false);
  assertEquals(isPro(''), false);
});

// Owner decision 2026-11-21 (Péter GO 17591): free = 3 searches and 5 Copilot messages a day.
Deno.test('free daily caps are 3 searches and 5 chat messages', () => {
  assertEquals(FREE_DAILY_SEARCH_CAP, 3);
  assertEquals(FREE_DAILY_CHAT_CAP, 5);
});

Deno.test('effectiveScanFrequency: the daily scan is Pro, a free daily account is scanned weekly', () => {
  assertEquals(effectiveScanFrequency('pro', 'daily'), 'daily');
  assertEquals(effectiveScanFrequency('free', 'daily'), 'weekly');
  assertEquals(effectiveScanFrequency(null, 'daily'), 'weekly');
  assertEquals(effectiveScanFrequency('pro', 'weekly'), 'weekly');
  assertEquals(effectiveScanFrequency('free', 'weekly'), 'weekly');
  assertEquals(effectiveScanFrequency('free', 'manual'), 'manual');
  assertEquals(effectiveScanFrequency('pro', 'manual'), 'manual');
  assertEquals(effectiveScanFrequency('free', null), 'weekly');
  assertEquals(effectiveScanFrequency('pro', 'hourly'), 'weekly');
});
