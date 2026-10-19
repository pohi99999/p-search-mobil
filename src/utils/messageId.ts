// Ids for chat messages (the React list key and the stored history entry). They are local and not a
// secret, so they only have to be unique on this device.
//
// crypto.randomUUID() must not be the only source: React Native / Hermes has no global `crypto`
// (Expo SDK 56's runtime does not install it and no dependency polyfills it), and a bare call threw
// before the chat request was sent (2026-10-19: the Send button did nothing on the phone, vc 14).
// It is used when present (web, tests on Node); otherwise time + counter + Math.random.
let counter = 0;

export function newMessageId(prefix = ''): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') {
    try {
      return prefix + c.randomUUID();
    } catch {
      // fall through to the local id
    }
  }
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
