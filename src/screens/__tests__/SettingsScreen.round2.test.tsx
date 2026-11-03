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

jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn() } }));

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
