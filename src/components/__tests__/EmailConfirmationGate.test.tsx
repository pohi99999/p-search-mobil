import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { EmailConfirmationGate } from '../EmailConfirmationGate';
import { CONFIRMED_COPY } from '../EmailConfirmedView';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/notify';
import { logger } from '../../utils/logger';
import { LINK_ERROR_MESSAGE, LINK_ERROR_TITLE } from '../../lib/authRedirect';

jest.mock('../../lib/supabase', () => ({ supabase: { auth: { setSession: jest.fn() } } }));
jest.mock('../../lib/notify', () => ({ notify: jest.fn() }));
jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

// Round 6, item E3: the page the confirmation e-mail's link opens. The fragment is injected (no browser here).
const SUCCESS = '#access_token=ACCESS&expires_in=3600&refresh_token=REFRESH&token_type=bearer&type=signup';
const EXPIRED = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid';

const mounted: renderer.ReactTestRenderer[] = [];
afterEach(async () => {
  await act(async () => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

async function render(hash: string) {
  const env = { getHash: jest.fn(() => hash), clearHash: jest.fn() };
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <EmailConfirmationGate env={env}>
        <Text testID="navigator">navigator</Text>
      </EmailConfirmationGate>
    );
  });
  mounted.push(tree!);
  const has = (id: string) => tree!.root.findAll((n) => n.props.testID === id).length > 0;
  const text = () => JSON.stringify(tree!.toJSON());
  const pressSignIn = async () => {
    const button = tree!.root.findAll((n) => n.props.testID === 'email-confirmed-sign-in' && typeof n.props.onPress === 'function')[0];
    await act(async () => {
      await button.props.onPress();
    });
  };
  return { env, has, text, pressSignIn };
}

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.auth.setSession as jest.Mock).mockResolvedValue({ data: {}, error: null });
});

describe('EmailConfirmationGate', () => {
  it('no fragment: the navigator, no view, nothing touched', async () => {
    const r = await render('');
    expect(r.has('navigator')).toBe(true);
    expect(r.has('email-confirmed')).toBe(false);
    expect(r.env.clearHash).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('a confirmation link: the view comes first (no sign-in flash), the tokens leave the URL at once, no session yet', async () => {
    const r = await render(SUCCESS);
    expect(r.has('email-confirmed')).toBe(true);
    expect(r.has('navigator')).toBe(false);
    expect(r.text()).toContain(CONFIRMED_COPY.title);
    expect(r.env.clearHash).toHaveBeenCalledTimes(1);
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('the Google Play button stays behind its switch (no public listing yet)', async () => {
    const r = await render(SUCCESS);
    expect(r.has('email-confirmed-play')).toBe(false);
    expect(r.text()).toContain(CONFIRMED_COPY.androidLine);
  });

  it('"Belépés a weben": signs in with the link\'s session, then the navigator (the view is gone)', async () => {
    const r = await render(SUCCESS);
    await r.pressSignIn();
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'ACCESS', refresh_token: 'REFRESH' });
    expect(r.has('navigator')).toBe(true);
    expect(r.has('email-confirmed')).toBe(false);
  });

  it('a refused session: still dismissed to the sign-in screen, and logged', async () => {
    (supabase.auth.setSession as jest.Mock).mockResolvedValue({ data: {}, error: { message: 'expired' } });
    const r = await render(SUCCESS);
    await r.pressSignIn();
    expect(r.has('navigator')).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('setSession throwing is no crash either', async () => {
    (supabase.auth.setSession as jest.Mock).mockRejectedValue(new Error('network'));
    const r = await render(SUCCESS);
    await r.pressSignIn();
    expect(r.has('navigator')).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('a failed link (expired / used): the sign-in screen, the URL cleaned, and the reason in words', async () => {
    const r = await render(EXPIRED);
    expect(r.has('navigator')).toBe(true);
    expect(r.has('email-confirmed')).toBe(false);
    expect(r.env.clearHash).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(LINK_ERROR_TITLE, LINK_ERROR_MESSAGE);
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('a password recovery fragment is none of ours: the navigator, the URL and the session untouched', async () => {
    const r = await render('#access_token=a&refresh_token=r&type=recovery');
    expect(r.has('navigator')).toBe(true);
    expect(r.env.clearHash).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });
});
