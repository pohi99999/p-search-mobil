// Card [G2]: helpers for the event wiring tests. track() is mocked globally in setupJest.js. No jest globals here
// (this folder is type-checked without them): the helpers return data, the tests assert.
import { track } from '../services/events';
import { sanitizeMeta } from '../services/eventMeta';

type Call = [string, Record<string, unknown> | undefined];
const recorded = (): Call[] => (track as unknown as { mock: { calls: Call[] } }).mock.calls;

/** The recorded calls of one event, as [name, meta] pairs. */
export function trackCalls(name: string): Call[] {
  return recorded().filter(([e]) => e === name);
}

/** The recorded metas the whitelist would change (a key dropped on its way to app_events); [] when all pass. */
export function metasOutsideWhitelist(): Record<string, unknown>[] {
  return recorded()
    .map(([, meta]) => meta)
    .filter((meta): meta is Record<string, unknown> => meta !== undefined && JSON.stringify(sanitizeMeta(meta)) !== JSON.stringify(meta));
}
