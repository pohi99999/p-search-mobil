import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { chatProfileDecision, chatProfileId } from './chat-profile.ts';

// Lumen's live chat 4937: business_profile_id null, match id given, the account had a profile.
Deno.test('a missing profile id is taken from the discussed match', () => {
  assertEquals(chatProfileId(null, 'bp-1'), { id: 'bp-1', source: 'match' });
  assertEquals(chatProfileId(undefined, 'bp-1'), { id: 'bp-1', source: 'match' });
  assertEquals(chatProfileId('', 'bp-1'), { id: 'bp-1', source: 'match' });
});

Deno.test('the id the client sent wins; nothing at all gives null', () => {
  assertEquals(chatProfileId('bp-own', 'bp-1'), { id: 'bp-own', source: 'request' });
  assertEquals(chatProfileId(null, null), null);
  assertEquals(chatProfileId(null, undefined), null);
});

Deno.test('ownership: own profile is used; a foreign sent id is refused, a foreign match profile skipped', () => {
  assertEquals(chatProfileDecision('request', 'u1', 'u1'), 'use');
  assertEquals(chatProfileDecision('match', 'u1', 'u1'), 'use');
  assertEquals(chatProfileDecision('request', 'u2', 'u1'), 'forbidden');
  assertEquals(chatProfileDecision('match', 'u2', 'u1'), 'skip');
  assertEquals(chatProfileDecision('request', null, 'u1'), 'skip');
});
