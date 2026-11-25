// P-Search round 6 (Péter 18328): on the web a reload signed the user out, because the session lived only in memory.
// The web store now keeps it in sessionStorage, with the old in-memory behaviour as the fallback.
import { createWebAuthStorage } from '../supabase';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({})) }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

class FakeStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const KEY = 'sb-test-auth-token';

describe('createWebAuthStorage', () => {
  it('a session written by one page load is read back by the next one (the reload case)', async () => {
    const tab = new FakeStorage();
    await createWebAuthStorage(() => tab).setItem(KEY, 'session-json');
    // a new store over the same tab storage stands for the reloaded page
    expect(await createWebAuthStorage(() => tab).getItem(KEY)).toBe('session-json');
  });

  it('sign-out removes it from the tab storage', async () => {
    const tab = new FakeStorage();
    const store = createWebAuthStorage(() => tab);
    await store.setItem(KEY, 'session-json');
    await store.removeItem(KEY);
    expect(tab.getItem(KEY)).toBeNull();
    expect(await createWebAuthStorage(() => tab).getItem(KEY)).toBeNull();
  });

  it('a missing key reads as null', async () => {
    expect(await createWebAuthStorage(() => new FakeStorage()).getItem(KEY)).toBeNull();
  });

  it('storage that throws (private mode) falls back to memory within the page, and sign-in still works', async () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const store = createWebAuthStorage(() => throwing);
    await store.setItem(KEY, 'session-json');
    expect(await store.getItem(KEY)).toBe('session-json');
    await store.removeItem(KEY);
    expect(await store.getItem(KEY)).toBeNull();
  });

  it('no storage at all (the getter throws or gives nothing) also falls back to memory', async () => {
    for (const getter of [() => undefined, () => { throw new Error('no window'); }]) {
      const store = createWebAuthStorage(getter as () => undefined);
      await store.setItem(KEY, 'v');
      expect(await store.getItem(KEY)).toBe('v');
    }
  });
});

// Ellenőr 9168 on #280: partial failures (only some methods throw). The page's own writes and removals win.
describe('createWebAuthStorage with a partly failing storage', () => {
  it('a sign-out whose storage removal throws does not bring the old session back in this page', async () => {
    const tab = new FakeStorage();
    tab.setItem(KEY, 'old-session');
    const store = createWebAuthStorage(() => ({
      getItem: (k: string) => tab.getItem(k),
      setItem: (k: string, v: string) => tab.setItem(k, v),
      removeItem: () => {
        throw new Error('SecurityError');
      },
    }));
    expect(await store.getItem(KEY)).toBe('old-session');
    await store.removeItem(KEY);
    expect(await store.getItem(KEY)).toBeNull();
  });

  it('a value from the previous page load is read when this page has not written it', async () => {
    const tab = new FakeStorage();
    tab.setItem(KEY, 'from-last-load');
    expect(await createWebAuthStorage(() => tab).getItem(KEY)).toBe('from-last-load');
  });
});
