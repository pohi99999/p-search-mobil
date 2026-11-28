// Round 6, item A: the weekly e-mail digest's opt-in in the app (the switch in Settings, the one-time question on Home).
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { DigestSwitch } from '../DigestSwitch';
import { DigestOptInCard } from '../DigestOptInCard';
import { loadDigestPreference, saveDigestPreference } from '../../lib/digestPreference';

jest.mock('../../lib/digestPreference', () => {
  const actual = jest.requireActual('../../lib/digestPreference');
  return { ...actual, loadDigestPreference: jest.fn(), saveDigestPreference: jest.fn() };
});
jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const load = loadDigestPreference as jest.Mock;
const save = saveDigestPreference as jest.Mock;

const mounted: renderer.ReactTestRenderer[] = [];
afterEach(async () => {
  await act(async () => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

async function render(el: React.ReactElement) {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(el);
  });
  await act(async () => {});
  mounted.push(tree!);
  const has = (id: string) => tree!.root.findAll((n) => n.props.testID === id).length > 0;
  const byId = (id: string) => tree!.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
  const sw = () => tree!.root.findAll((n) => n.props.testID === 'digest-switch' && typeof n.props.onValueChange === 'function')[0];
  return { tree: tree!, has, byId, sw };
}

beforeEach(() => {
  jest.clearAllMocks();
  save.mockImplementation((enabled: boolean) => Promise.resolve({ enabled, askedAt: '2026-11-26T14:00:00.000Z' }));
});

describe('DigestSwitch (Settings)', () => {
  it('shows the stored state, off by default', async () => {
    load.mockResolvedValue({ enabled: false, askedAt: null });
    const r = await render(<DigestSwitch />);
    expect(r.sw().props.value).toBe(false);
  });

  it('turning it on saves true and shows it on; turning it off saves false', async () => {
    load.mockResolvedValue({ enabled: false, askedAt: null });
    const r = await render(<DigestSwitch />);
    await act(async () => {
      await r.sw().props.onValueChange(true);
    });
    expect(save).toHaveBeenLastCalledWith(true);
    expect(r.sw().props.value).toBe(true);
    await act(async () => {
      await r.sw().props.onValueChange(false);
    });
    expect(save).toHaveBeenLastCalledWith(false);
    expect(r.sw().props.value).toBe(false);
  });

  it('a failed save keeps the old state and says so', async () => {
    load.mockResolvedValue({ enabled: false, askedAt: null });
    save.mockRejectedValue(new Error('offline'));
    const r = await render(<DigestSwitch />);
    await act(async () => {
      await r.sw().props.onValueChange(true);
    });
    expect(r.sw().props.value).toBe(false);
    expect(r.has('digest-switch-error')).toBe(true);
  });

  it('an unreadable preference shows no card at all (no guessed state to overwrite)', async () => {
    load.mockRejectedValue(new Error('offline'));
    const r = await render(<DigestSwitch />);
    expect(r.has('digest-card')).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('the switch is named for screen readers', async () => {
    load.mockResolvedValue({ enabled: true, askedAt: 'x' });
    const r = await render(<DigestSwitch />);
    expect(r.sw().props.accessibilityLabel).toMatch(/^Heti e-mail összefoglaló: /);
  });
});

describe('DigestOptInCard (Home)', () => {
  it('not before the first search', async () => {
    load.mockResolvedValue({ enabled: false, askedAt: null });
    const r = await render(<DigestOptInCard hasSearched={false} />);
    expect(r.has('digest-opt-in')).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('after the first search, once: shown while not asked, not shown once answered', async () => {
    load.mockResolvedValue({ enabled: false, askedAt: null });
    expect((await render(<DigestOptInCard hasSearched />)).has('digest-opt-in')).toBe(true);
    load.mockResolvedValue({ enabled: false, askedAt: '2026-11-20T10:00:00.000Z' });
    expect((await render(<DigestOptInCard hasSearched />)).has('digest-opt-in')).toBe(false);
  });

  it('"Igen, kérem" opts in and the card goes; "Most nem" records the answer without opting in', async () => {
    load.mockResolvedValue({ enabled: false, askedAt: null });
    const yes = await render(<DigestOptInCard hasSearched />);
    await act(async () => {
      await yes.byId('digest-opt-in-yes').props.onPress();
    });
    expect(save).toHaveBeenLastCalledWith(true);
    expect(yes.has('digest-opt-in')).toBe(false);

    const no = await render(<DigestOptInCard hasSearched />);
    await act(async () => {
      await no.byId('digest-opt-in-no').props.onPress();
    });
    expect(save).toHaveBeenLastCalledWith(false);
    expect(no.has('digest-opt-in')).toBe(false);
  });

  it('a failed answer keeps the card and says so', async () => {
    load.mockResolvedValue({ enabled: false, askedAt: null });
    save.mockRejectedValue(new Error('offline'));
    const r = await render(<DigestOptInCard hasSearched />);
    await act(async () => {
      await r.byId('digest-opt-in-yes').props.onPress();
    });
    expect(r.has('digest-opt-in')).toBe(true);
    expect(r.has('digest-opt-in-error')).toBe(true);
  });

  it('an unreadable preference shows nothing', async () => {
    load.mockRejectedValue(new Error('offline'));
    expect((await render(<DigestOptInCard hasSearched />)).has('digest-opt-in')).toBe(false);
  });
});
