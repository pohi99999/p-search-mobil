import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsScreen } from '../SettingsScreen';
import { supabase } from '../../lib/supabase';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '8' }));
// Round 11-21: the daily scan is Pro; Pro by default here, the free account set per test.
const mockBilling: { isPro: boolean; isLoading: boolean } = { isPro: true, isLoading: false };
jest.mock('../../context/BillingContext', () => ({ useBilling: () => mockBilling }));

jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));

const mockClearChat = jest.fn().mockResolvedValue(undefined);
jest.mock('../../hooks/useCopilotChat', () => ({ clearStoredChatHistory: () => mockClearChat() }));

jest.mock('react-native-paper', () => {
  const React = require('react');
  const Actual = jest.requireActual('react-native-paper');
  return {
    ...Actual,
    Snackbar: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(Actual.Text, null, children) : null,
  };
});

const navigation = {
  canGoBack: jest.fn().mockReturnValue(true),
  goBack: jest.fn(),
  navigate: jest.fn(),
} as unknown as NativeStackNavigationProp<RootStackParamList, 'Settings'>;

// Unmount every rendered screen after each test: react-native-paper's TextInput schedules a 50 ms
// placeholder timer whose effect cleanup is the only thing that cancels it. Left mounted, on the
// slower CI runner it fired after the Jest environment was torn down ("import a file after the
// Jest environment has been torn down"), an uncaught error that made `npm test -- --ci` exit 1
// although every test passed.
const mounted: renderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((c) => c.unmount());
  });
});

const render = async () => {
  let component: renderer.ReactTestRenderer;
  await act(async () => {
    component = renderer.create(
      <SafeAreaProvider
        initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
      >
        <SettingsScreen navigation={navigation} route={{ key: 'settings', name: 'Settings' }} />
      </SafeAreaProvider>
    );
    mounted.push(component);
    await Promise.resolve();
  });
  return component!;
};

const byTestID = (component: renderer.ReactTestRenderer, id: string) =>
  component.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string');

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  (supabase.from as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { search_frequency: 'weekly', last_scan_at: null, next_scan_at: null }, error: null }),
    update: jest.fn(),
  });
});

// Round 2 (Lumen P2-2): the frequency rows are the radios, with a name and a checked state; there was a
// separate RadioButton inside each row that screen readers met without either.
describe('SettingsScreen search frequency radios', () => {
  const rows = (c: renderer.ReactTestRenderer) =>
    ['daily', 'weekly', 'manual'].map((v) => byTestID(c, `frequency-${v}`)[0]);

  it('each row is a named radio with its checked state; tapping one moves the check', async () => {
    const c = await render();
    const [daily, weekly, manual] = rows(c);
    for (const r of [daily, weekly, manual]) {
      expect(r.props.accessibilityRole).toBe('radio');
      // the name holds the visible text as it reads (title, then description), so voice control finds it
      expect(r.props.accessibilityLabel).toMatch(/^(Naponta|Hetente|Csak kézzel indítom) ./);
    }
    expect([daily, weekly, manual].map((r) => r.props.accessibilityState.checked)).toEqual([false, true, false]);
    await act(async () => { daily.props.onPress(); });
    expect(rows(c).map((r) => r.props.accessibilityState.checked)).toEqual([true, false, false]);
  });

  it('no unnamed radio is left inside the rows', async () => {
    const c = await render();
    const radios = c.root.findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.type !== 'string');
    expect(radios.every((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.length > 0)).toBe(true);
  });
});

// Round 2 (Lumen P2-8): sign-out lives in Settings, behind a confirmation.
describe('SettingsScreen sign-out', () => {
  it('the first tap only asks; the confirmation clears the local chat and signs out', async () => {
    const c = await render();
    expect(byTestID(c, 'logout-confirm')).toHaveLength(0);
    await act(async () => { byTestID(c, 'logout-open')[0].props.onPress(); });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(JSON.stringify(c.toJSON())).toContain('Biztosan kijelentkezel?');
    await act(async () => { await byTestID(c, 'logout-confirm')[0].props.onPress(); });
    expect(mockClearChat).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('Mégse closes the question without signing out', async () => {
    const c = await render();
    await act(async () => { byTestID(c, 'logout-open')[0].props.onPress(); });
    await act(async () => { byTestID(c, 'logout-cancel')[0].props.onPress(); });
    expect(byTestID(c, 'logout-confirm')).toHaveLength(0);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('a failed chat-history clean-up does not block the sign-out', async () => {
    mockClearChat.mockRejectedValueOnce(new Error('storage'));
    const c = await render();
    await act(async () => { byTestID(c, 'logout-open')[0].props.onPress(); });
    await act(async () => { await byTestID(c, 'logout-confirm')[0].props.onPress(); });
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });
});

// Round 11-21 (Péter GO 17591): the daily scan is Pro. A free account sees the daily row as a Pro offer.
describe('SettingsScreen daily scan for a free account', () => {
  const { DAILY_PRO_LABEL, DAILY_PRO_DESCRIPTION } = require('../SettingsScreen');
  const rows = (c: renderer.ReactTestRenderer) => ['daily', 'weekly', 'manual'].map((v) => byTestID(c, `frequency-${v}`)[0]);
  const withStored = (search_frequency: string) => {
    const updateEq = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { search_frequency, last_scan_at: null, next_scan_at: null }, error: null }),
      update,
    });
    return update;
  };
  const save = async (c: renderer.ReactTestRenderer) => {
    const button = c.root.findAll((n) => typeof n.type !== 'string' && n.props.children === 'Mentés' && typeof n.props.onPress === 'function')[0];
    await act(async () => { await button.props.onPress(); });
  };

  beforeEach(() => { mockBilling.isPro = false; mockBilling.isLoading = false; });
  afterEach(() => { mockBilling.isPro = true; mockBilling.isLoading = false; });

  it('the daily row names the Pro, and a tap opens the paywall instead of selecting it', async () => {
    withStored('weekly');
    const c = await render();
    const [daily] = rows(c);
    expect(daily.props.title).toBe(DAILY_PRO_LABEL);
    expect(daily.props.description).toBe(DAILY_PRO_DESCRIPTION);
    expect(daily.props.accessibilityLabel).toBe(`${DAILY_PRO_LABEL} ${DAILY_PRO_DESCRIPTION}`);
    await act(async () => { daily.props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('Paywall');
    expect(rows(c).map((r) => r.props.accessibilityState.checked)).toEqual([false, true, false]);
  });

  it('a free account with "daily" stored sees weekly, the next scan in 7 days, and the stored choice is kept', async () => {
    const update = withStored('daily');
    const c = await render();
    expect(rows(c).map((r) => r.props.accessibilityState.checked)).toEqual([false, true, false]);
    await save(c);
    // Ellenőr #272 H1: never a silent downgrade of the stored value; the server runs a free 'daily' weekly.
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ search_frequency: 'daily' }));
    const next = new Date(update.mock.calls[0][0].next_scan_at).getTime();
    const days = (next - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('a Pro account keeps the plain daily row and can select it', async () => {
    mockBilling.isPro = true;
    withStored('weekly');
    const c = await render();
    const [daily] = rows(c);
    expect(daily.props.title).toBe('Naponta');
    await act(async () => { daily.props.onPress(); });
    expect(navigation.navigate).not.toHaveBeenCalledWith('Paywall');
    expect(rows(c).map((r) => r.props.accessibilityState.checked)).toEqual([true, false, false]);
  });

  // Ellenőr #272 H1: until the billing answers (or when it failed) a Pro account must not lose its daily scan.
  it('billing not answered yet: the daily row is not locked, the stored daily shows and is saved as daily', async () => {
    mockBilling.isLoading = true;
    const update = withStored('daily');
    const c = await render();
    const [daily] = rows(c);
    expect(daily.props.title).toBe('Naponta');
    expect(rows(c).map((r) => r.props.accessibilityState.checked)).toEqual([true, false, false]);
    await save(c);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ search_frequency: 'daily' }));
  });

  it('billing failed (answered "not Pro"): the stored daily is still kept on save', async () => {
    mockBilling.isLoading = false;
    const update = withStored('daily');
    const c = await render();
    await save(c);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ search_frequency: 'daily' }));
  });

  it('a free account that picks weekly saves weekly', async () => {
    const update = withStored('daily');
    const c = await render();
    await act(async () => { rows(c)[1].props.onPress(); });
    await save(c);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ search_frequency: 'weekly' }));
  });
});

// Round 6 (Kenshin, measured on the live web app 2026-11-25): the Pro, profile-edit and privacy rows reached the
// accessibility tree as "generic", so a screen reader did not say they can be tapped. The host view must carry the
// button role and a name that starts with the visible title, like the sign-out row.
describe('SettingsScreen navigation rows are named buttons', () => {
  const host = (c: renderer.ReactTestRenderer, id: string) =>
    c.root.findAll((n) => n.props.testID === id && typeof n.type === 'string')[0];

  // The visible title and description as rendered inside the row (the icon glyphs are left out).
  const visible = (node: renderer.ReactTestInstance) =>
    node
      .findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string')
      .map((n) => n.props.children as string)
      .filter((t) => /\p{L}{3,}/u.test(t));

  // Ellenőr 9158 (note 2): the label is checked whole, against what the row shows, not only its first words.
  it.each([
    ['settings-pro-entry', ''],
    ['settings-profile-edit', ''],
    ['settings-privacy-entry', ' Megnyitás a böngészőben.'],
  ])('%s: a button named "title: description" as the row shows them', async (id, suffix) => {
    const c = await render();
    const node = host(c, id);
    expect(node).toBeDefined();
    expect(node.props.accessibilityRole).toBe('button');
    const [title, description] = visible(node);
    expect(node.props.accessibilityLabel).toBe(`${title}: ${description}${suffix}`);
  });

  it('the Pro row\'s name follows the billing state', async () => {
    const was = mockBilling.isPro;
    try {
      for (const isPro of [false, true]) {
        mockBilling.isPro = isPro;
        const c = await render();
        const node = host(c, 'settings-pro-entry');
        const [title, description] = visible(node);
        expect(description).toBe(isPro ? 'Aktív Pro előfizetés. Csomagok és visszaállítás.' : 'Copilot akcióterv, reklámmentes használat, korlátlan keresés.');
        expect(node.props.accessibilityLabel).toBe(`${title}: ${description}`);
      }
    } finally {
      mockBilling.isPro = was;
    }
  });
});

// Round 6 item 9 (Kenshin, measured on a stub 2026-11-25): when the schedule could not be read, the screen showed
// "Még nem futott / Nincs ütemezve" under a default "Hetente", and Mentés stayed active, so a save would have
// overwritten the stored cadence with the default. Now the block says it failed, offers a retry, and Mentés waits.
describe('SettingsScreen when the schedule cannot be read', () => {
  const textOf = (c: renderer.ReactTestRenderer) =>
    c.root
      .findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string')
      .map((n) => n.props.children as string)
      .join(' | ');
  const saveButton = (c: renderer.ReactTestRenderer) =>
    c.root.findAll((n) => n.props.accessibilityLabel === 'Keresési beállítások mentése' && typeof n.type !== 'string')[0];

  const readFails = () =>
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
      update: jest.fn(),
    });

  it('says it failed instead of showing defaults, and Mentés is disabled', async () => {
    readFails();
    const c = await render();
    const text = textOf(c);
    expect(text).toContain('Nem sikerült betölteni a keresési beállításokat.');
    expect(text).not.toContain('Még nem futott');
    expect(text).not.toContain('Nincs ütemezve');
    expect(saveButton(c).props.disabled).toBe(true);
    expect(byTestID(c, 'settings-schedule-retry').length).toBeGreaterThan(0);
  });

  it('a retry that reads the schedule shows it and enables Mentés', async () => {
    readFails();
    const c = await render();
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { search_frequency: 'manual', last_scan_at: null, next_scan_at: null }, error: null }),
      update: jest.fn(),
    });
    await act(async () => {
      byTestID(c, 'settings-schedule-retry')[0].props.onPress();
      await Promise.resolve();
    });
    const text = textOf(c);
    expect(text).not.toContain('Nem sikerült betölteni a keresési beállításokat.');
    expect(text).toContain('Még nem futott');
    expect(saveButton(c).props.disabled).toBe(false);
    expect(byTestID(c, 'frequency-manual')[0].props.accessibilityState.checked).toBe(true);
    expect(byTestID(c, 'settings-schedule-retry')).toHaveLength(0);
  });
});
