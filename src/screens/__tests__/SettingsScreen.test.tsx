import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Button, List } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsScreen } from '../SettingsScreen';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    from: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('react-native-paper', () => {
  const React = require('react');
  const Actual = jest.requireActual('react-native-paper');
  return {
    ...Actual,
    Snackbar: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(Actual.Text, null, children) : null,
  };
});

const createNavigationMock = () =>
  ({
    canGoBack: jest.fn().mockReturnValue(true),
    goBack: jest.fn(),
    navigate: jest.fn(),
  }) as unknown as NativeStackNavigationProp<RootStackParamList, 'Settings'>;

const renderSettingsScreen = async () => {
  const navigation = createNavigationMock();
  let component: renderer.ReactTestRenderer;

  await act(async () => {
    component = renderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 0, height: 0 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <SettingsScreen navigation={navigation} route={{ key: 'settings', name: 'Settings' }} />
      </SafeAreaProvider>
    );
    await Promise.resolve();
  });

  return component!;
};

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    });
  });

  it('renders frequency options and saves a daily schedule with a next scan date', async () => {
    const updateEq = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          search_frequency: 'weekly',
          last_scan_at: null,
          next_scan_at: null,
        },
        error: null,
      }),
      update,
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const component = await renderSettingsScreen();
    const tree = JSON.stringify(component.toJSON());

    expect(tree).toContain('Naponta');
    expect(tree).toContain('Hetente');
    expect(tree).toContain('Csak kézzel indítom');

    const dailyOption = component.root.findAllByType(List.Item).find(
      (item) => item.props.title === 'Naponta'
    );
    expect(dailyOption).toBeDefined();

    await act(async () => {
      dailyOption!.props.onPress();
    });

    const saveButton = component.root.findAllByType(Button).find(
      (button) => button.props.children === 'Mentés'
    );
    expect(saveButton).toBeDefined();

    await act(async () => {
      await saveButton!.props.onPress();
    });

    expect(update).toHaveBeenCalledWith({
      search_frequency: 'daily',
      next_scan_at: expect.any(String),
    });

    const updatePayload = update.mock.calls[0][0] as { next_scan_at: string };
    expect(new Date(updatePayload.next_scan_at).toString()).not.toBe('Invalid Date');
    expect(updateEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('shows generic feedback and logs details when saving fails', async () => {
    const updateError = new Error('DB update failed');
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          search_frequency: 'weekly',
          last_scan_at: null,
          next_scan_at: null,
        },
        error: null,
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: updateError }),
      }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const component = await renderSettingsScreen();
    const saveButton = component.root.findAllByType(Button).find(
      (button) => button.props.children === 'Mentés'
    );

    await act(async () => {
      await saveButton!.props.onPress();
    });

    const tree = JSON.stringify(component.toJSON());
    expect(tree).toContain('Nem sikerült menteni a beállításokat');
    expect(logger.error).toHaveBeenCalledWith('SettingsScreen mentési hiba:', 'DB update failed');
  });
});
