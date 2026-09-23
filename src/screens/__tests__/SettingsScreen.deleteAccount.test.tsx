import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Button, TextInput } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsScreen, DELETE_CONFIRM_WORD } from '../SettingsScreen';
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

jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn() } }));

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

const buttonByLabel = (component: renderer.ReactTestRenderer, label: string) =>
  component.root.findAllByType(Button).find((b) => b.props.accessibilityLabel === label);

describe('SettingsScreen account deletion', () => {
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

  it('does not call the function until the confirmation word is typed exactly', async () => {
    const component = await render();
    await act(async () => { buttonByLabel(component, 'Fiók törlésének indítása')!.props.onPress(); });

    const confirm = () => buttonByLabel(component, 'Fiók végleges törlése')!;
    expect(confirm().props.disabled).toBe(true);

    const input = component.root.findAllByType(TextInput).find((i) => i.props.accessibilityLabel === 'Törlés megerősítő szó')!;
    await act(async () => { input.props.onChangeText('torles'); });
    expect(confirm().props.disabled).toBe(true);
    await act(async () => { confirm().props.onPress(); });
    expect(supabase.functions.invoke).not.toHaveBeenCalled();

    await act(async () => { input.props.onChangeText(DELETE_CONFIRM_WORD); });
    expect(confirm().props.disabled).toBe(false);
  });

  it('calls delete-account with confirm:true and no user id, then signs out', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { deleted: true }, error: null });
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
    const component = await render();
    await act(async () => { buttonByLabel(component, 'Fiók törlésének indítása')!.props.onPress(); });
    const input = component.root.findAllByType(TextInput).find((i) => i.props.accessibilityLabel === 'Törlés megerősítő szó')!;
    await act(async () => { input.props.onChangeText(DELETE_CONFIRM_WORD); });
    await act(async () => { buttonByLabel(component, 'Fiók végleges törlése')!.props.onPress(); });

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account', { body: { confirm: true } });
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('shows an error and does NOT sign out when the function fails', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: new Error('500') });
    const component = await render();
    await act(async () => { buttonByLabel(component, 'Fiók törlésének indítása')!.props.onPress(); });
    const input = component.root.findAllByType(TextInput).find((i) => i.props.accessibilityLabel === 'Törlés megerősítő szó')!;
    await act(async () => { input.props.onChangeText(DELETE_CONFIRM_WORD); });
    await act(async () => { buttonByLabel(component, 'Fiók végleges törlése')!.props.onPress(); });

    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(JSON.stringify(component.toJSON())).toContain('Nem sikerült törölni a fiókot');
  });
});
