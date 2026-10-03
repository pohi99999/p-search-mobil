import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Linking } from 'react-native';
import { List } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsScreen } from '../SettingsScreen';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '8' }));

jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn() } }));

const navigation = {
  canGoBack: jest.fn().mockReturnValue(true),
  goBack: jest.fn(),
  navigate: jest.fn(),
} as unknown as NativeStackNavigationProp<RootStackParamList, 'Settings'>;

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
    await Promise.resolve();
  });
  return component!;
};

const privacyRow = (component: renderer.ReactTestRenderer) =>
  component.root.findAllByType(List.Item).find((n) => n.props.testID === 'settings-privacy-entry');

// Google Play's User Data policy wants the privacy notice reachable inside the app (card c0a8c2bd).
// The URL is spelled out here on purpose: a changed URL in the screen must fail this test.
describe('SettingsScreen privacy notice link', () => {
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

  it('has an "Adatvédelmi tájékoztató" row', async () => {
    const component = await render();
    const row = privacyRow(component);
    expect(row).toBeDefined();
    expect(row!.props.title).toBe('Adatvédelmi tájékoztató');
  });

  it('opens the privacy notice on the Pohánka site', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const component = await render();
    await act(async () => {
      privacyRow(component)!.props.onPress();
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://www.pohankaestarsa.com/p-search/adatvedelem');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('logs instead of crashing when the link cannot be opened', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'));
    const component = await render();
    await act(async () => {
      privacyRow(component)!.props.onPress();
      await Promise.resolve();
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
