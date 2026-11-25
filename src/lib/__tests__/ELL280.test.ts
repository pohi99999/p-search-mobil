// Ellenőr, independent measurement of PR #280 (web session in sessionStorage). Loads the REAL module with Platform.OS = 'web'
// and a fake window, so the wiring (which storage the app really uses) is measured, not only createWebAuthStorage.
type Fake = { data: Map<string, string>; calls: string[]; getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void };
const fake = (name: string): Fake => {
  const f: Fake = {
    data: new Map(), calls: [],
    getItem(k) { f.calls.push(`${name}.get`); return f.data.has(k) ? (f.data.get(k) as string) : null; },
    setItem(k, v) { f.calls.push(`${name}.set`); f.data.set(k, v); },
    removeItem(k) { f.calls.push(`${name}.remove`); f.data.delete(k); },
  };
  return f;
};

const SESSION = JSON.stringify({ access_token: 'a1', refresh_token: 'r1', user: { id: 'u1' } });
const KEY = 'sb-127-auth-token';

function loadWeb(win: unknown) {
  let captured: any = null;
  let mod: any;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
    jest.doMock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
    jest.doMock('@supabase/supabase-js', () => ({ createClient: jest.fn((_u: string, _k: string, o: any) => { captured = o; return {}; }) }));
    jest.doMock('react-native-url-polyfill/auto', () => ({}));
    jest.doMock('../../config/env', () => ({ SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_ANON_KEY: 'k' }));
    (global as any).window = win;
    mod = require('../supabase');
  });
  return { storage: captured.auth.storage, mod, options: captured.auth };
}

afterEach(() => { delete (global as any).window; jest.resetModules(); });

describe('ELL #280 wiring: the app really uses window.sessionStorage', () => {
  it('web: a session is written to sessionStorage and NEVER touches localStorage', async () => {
    const session = fake('session'); const local = fake('local');
    const { storage } = loadWeb({ sessionStorage: session, localStorage: local });
    await storage.setItem(KEY, SESSION);
    expect(session.data.get(KEY)).toBe(SESSION);
    expect(await storage.getItem(KEY)).toBe(SESSION);
    await storage.removeItem(KEY);
    expect(session.data.has(KEY)).toBe(false);
    expect(local.calls).toEqual([]);           // localStorage not touched at all
    expect(local.data.size).toBe(0);
  });

  it('web: reload = a fresh module over the same tab storage reads the same session', async () => {
    const session = fake('session');
    await loadWeb({ sessionStorage: session, localStorage: fake('local') }).storage.setItem(KEY, SESSION);
    const reloaded = loadWeb({ sessionStorage: session, localStorage: fake('local') });
    expect(await reloaded.storage.getItem(KEY)).toBe(SESSION);
  });

  it('web: the client options still persist the session and refresh the token', () => {
    const { options } = loadWeb({ sessionStorage: fake('s'), localStorage: fake('l') });
    expect(options.persistSession).toBe(true);
    expect(options.autoRefreshToken).toBe(true);
  });
});

describe('ELL #280 native path is unchanged', () => {
  it('ios: the client gets the SecureStore adapter, not a web store', async () => {
    let captured: any = null;
    const secure = { getItemAsync: jest.fn().mockResolvedValue('x'), setItemAsync: jest.fn().mockResolvedValue(undefined), deleteItemAsync: jest.fn().mockResolvedValue(undefined) };
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
      jest.doMock('expo-secure-store', () => secure);
      jest.doMock('@supabase/supabase-js', () => ({ createClient: jest.fn((_u: string, _k: string, o: any) => { captured = o; return {}; }) }));
      jest.doMock('react-native-url-polyfill/auto', () => ({}));
      jest.doMock('../../config/env', () => ({ SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_ANON_KEY: 'k' }));
      require('../supabase');
    });
    expect(await captured.auth.storage.getItem('k')).toBe('x');
    await captured.auth.storage.setItem('k', 'v');
    await captured.auth.storage.removeItem('k');
    expect(secure.getItemAsync).toHaveBeenCalledWith('k');
    expect(secure.setItemAsync).toHaveBeenCalledWith('k', 'v');
    expect(secure.deleteItemAsync).toHaveBeenCalledWith('k');
  });
});

describe('ELL #280 partial storage failure (only some methods throw)', () => {
  const partial = (over: Partial<Fake> & { setItem?: any; getItem?: any }) => ({ ...fake('p'), ...over });

  it('setItem throws (quota) while getItem works: the value written in this page is still readable (memory fallback)', async () => {
    const quota = partial({ setItem: () => { throw new Error('QuotaExceededError'); } });
    const { storage } = loadWeb({ sessionStorage: quota, localStorage: fake('l') });
    await storage.setItem(KEY, SESSION);
    expect(await storage.getItem(KEY)).toBe(SESSION);
  });

  it('a refreshed token is not lost behind a stale stored one when a later write throws', async () => {
    let fail = false;
    const s = fake('s');
    const flaky = { getItem: (k: string) => s.getItem(k), removeItem: (k: string) => s.removeItem(k), setItem: (k: string, v: string) => { if (fail) throw new Error('QuotaExceededError'); s.setItem(k, v); } };
    const { storage } = loadWeb({ sessionStorage: flaky, localStorage: fake('l') });
    await storage.setItem(KEY, JSON.stringify({ refresh_token: 'r1' }));
    fail = true;
    await storage.setItem(KEY, JSON.stringify({ refresh_token: 'r2' }));   // the refreshed session
    expect(JSON.parse((await storage.getItem(KEY)) as string).refresh_token).toBe('r2');
  });

  it('removeItem after a memory-only write leaves nothing behind', async () => {
    const quota = partial({ setItem: () => { throw new Error('QuotaExceededError'); } });
    const { storage } = loadWeb({ sessionStorage: quota, localStorage: fake('l') });
    await storage.setItem(KEY, SESSION);
    await storage.removeItem(KEY);
    expect(await storage.getItem(KEY)).toBeNull();
  });
});
