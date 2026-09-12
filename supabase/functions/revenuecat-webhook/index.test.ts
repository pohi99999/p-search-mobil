import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { tierForEvent, safeEqual } from './index.ts';

Deno.test('tierForEvent: purchases/renewals -> pro', () => {
  for (const t of ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TRIAL_STARTED', 'TRIAL_CONVERTED']) {
    assertEquals(tierForEvent(t), 'pro');
  }
});
Deno.test('tierForEvent: expiration/pause -> free', () => {
  assertEquals(tierForEvent('EXPIRATION'), 'free');
  assertEquals(tierForEvent('SUBSCRIPTION_PAUSED'), 'free');
});
Deno.test('tierForEvent: cancellation and others -> no change (null)', () => {
  for (const t of ['CANCELLATION', 'BILLING_ISSUE', 'TEST', 'TRANSFER', 'UNKNOWN', '', undefined, null]) {
    assertEquals(tierForEvent(t as never), null);
  }
});

Deno.test('safeEqual: exact match true, any diff false', () => {
  assertEquals(safeEqual('secret-123', 'secret-123'), true);
  assertEquals(safeEqual('secret-123', 'secret-124'), false);
  assertEquals(safeEqual('secret', 'secret-longer'), false);
  assertEquals(safeEqual('', ''), true);
});
