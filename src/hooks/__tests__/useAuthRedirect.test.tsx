// Round 6, item E3 follow-up (Ellenőr 9330/9341, Marveen 9342): the two guarantees the gate's tests did not hold.
// 1. browserEnv.clearHash removes the fragment with replaceState and path + query only: the tokens leave the address
//    bar AND the history entry (a pushState, or the full href, would keep them).
// 2. No token text reaches the logger (logger.warn also reports to Sentry) or the notice, whatever setSession does.
import React from 'react';
import { Platform } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { browserEnv, useAuthRedirect } from '../useAuthRedirect';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/notify';
import { logger } from '../../utils/logger';

jest.mock('../../lib/supabase', () => ({ supabase: { auth: { setSession: jest.fn() } } }));
jest.mock('../../lib/notify', () => ({ notify: jest.fn() }));
jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const ACCESS = 'eyJhbGciOiJIUzI1NiJ9.ACCESS-TOKEN-BODY.ACCESS-SIG';
const REFRESH = 'REFRESH-TOKEN-VALUE-7f3a';
const SUCCESS = `#access_token=${ACCESS}&expires_in=3600&refresh_token=${REFRESH}&token_type=bearer&type=signup`;

describe('browserEnv.clearHash', () => {
  const g = globalThis as unknown as { window?: unknown };
  let savedWindow: unknown;
  let savedOS: PropertyDescriptor | undefined;
  const replaceState = jest.fn();
  const pushState = jest.fn();

  beforeEach(() => {
    savedWindow = g.window;
    savedOS = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
    g.window = {
      location: { pathname: '/app', search: '?ref=mail', hash: SUCCESS, href: `https://x.test/app?ref=mail${SUCCESS}` },
      history: { replaceState, pushState },
    };
    replaceState.mockClear();
    pushState.mockClear();
  });

  afterEach(() => {
    g.window = savedWindow;
    if (savedOS) Object.defineProperty(Platform, 'OS', savedOS);
  });

  it('replaces the history entry with path + query, no fragment, no token', () => {
    browserEnv.clearHash();
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/app?ref=mail');
    expect(JSON.stringify(replaceState.mock.calls)).not.toMatch(/ACCESS|REFRESH|#/);
  });

  it('reads the fragment on the web', () => {
    expect(browserEnv.getHash()).toBe(SUCCESS);
  });
});

describe('useAuthRedirect: no token in the logger or the notice', () => {
  let api: ReturnType<typeof useAuthRedirect> | null = null;
  function Probe() {
    api = useAuthRedirect({ getHash: () => SUCCESS, clearHash: jest.fn() });
    return null;
  }

  async function signIn() {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe />);
    });
    expect(api!.confirmed).not.toBeNull();
    await act(async () => {
      await api!.signIn();
    });
    await act(async () => tree!.unmount());
  }

  const everythingLogged = () =>
    JSON.stringify([
      (logger.warn as jest.Mock).mock.calls,
      (logger.error as jest.Mock).mock.calls,
      (logger.info as jest.Mock).mock.calls,
      (logger.debug as jest.Mock).mock.calls,
      (notify as jest.Mock).mock.calls,
    ]);

  beforeEach(() => jest.clearAllMocks());

  it('setSession returns an error: logged, without the tokens', async () => {
    (supabase.auth.setSession as jest.Mock).mockResolvedValue({ data: {}, error: { message: 'Invalid Refresh Token' } });
    await signIn();
    expect(logger.warn).toHaveBeenCalled();
    expect(everythingLogged()).not.toContain(ACCESS);
    expect(everythingLogged()).not.toContain(REFRESH);
    expect(everythingLogged()).not.toContain('ACCESS-TOKEN-BODY');
  });

  it('setSession throws: logged, without the tokens', async () => {
    (supabase.auth.setSession as jest.Mock).mockRejectedValue(new Error('network down'));
    await signIn();
    expect(logger.warn).toHaveBeenCalled();
    expect(everythingLogged()).not.toContain(ACCESS);
    expect(everythingLogged()).not.toContain(REFRESH);
  });

  it('setSession succeeds: nothing logged at all', async () => {
    (supabase.auth.setSession as jest.Mock).mockResolvedValue({ data: {}, error: null });
    await signIn();
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: ACCESS, refresh_token: REFRESH });
    expect(everythingLogged()).toBe('[[],[],[],[],[]]');
  });
});
