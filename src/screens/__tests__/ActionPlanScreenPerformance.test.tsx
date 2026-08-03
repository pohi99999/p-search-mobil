import React from 'react';
import renderer from 'react-test-renderer';
import { ActionPlanScreen } from '../ActionPlanScreen';
import { supabase } from '../../lib/supabase';
import { ProfileProvider } from '../../context/ProfileContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Mock Expo modules
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn()
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn()
}));

// Mock Supabase globally for this test
jest.mock('../../lib/supabase', () => {
  const mockSingle = jest.fn().mockResolvedValue({
    data: { id: 'test-business-id' }
  });
  const mockEq = jest.fn().mockReturnValue({
    single: mockSingle
  });
  const mockSelect = jest.fn().mockReturnValue({
    eq: mockEq
  });
  const mockFrom = jest.fn().mockReturnValue({
    select: mockSelect
  });

  return {
    supabase: {
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: { user: { id: 'test-user-id' } } }
        }),
        onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } })
      },
      from: mockFrom,
      functions: {
        invoke: jest.fn().mockResolvedValue({
          data: { text: 'Test AI response' }
        })
      }
    },
    mockSingle, // Exported to count calls
  };
});

// Mock InterstitialAd hook
jest.mock('../../hooks/useInterstitialAd', () => ({
  useInterstitialAd: () => ({
    showAdIfAvailable: (callback: any) => callback()
  })
}));

jest.useFakeTimers();

describe('ActionPlanScreen Performance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('measures redundant db calls for profile fetching', async () => {
    const { mockSingle } = require('../../lib/supabase');

    const route = { params: { matchId: null } } as any;
    const navigation = {} as any;

    // Mount the app-level provider
    let appLevelComponent: renderer.ReactTestRenderer;
    await renderer.act(async () => {
        appLevelComponent = renderer.create(
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <ProfileProvider>
                    <></>
                </ProfileProvider>
            </SafeAreaProvider>
        )
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    const initialCalls = mockSingle.mock.calls.length;
    console.log(`Initial DB calls: ${initialCalls}`);

    // Navigate to Chat Screen
    await renderer.act(async () => {
        appLevelComponent.update(
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <ProfileProvider>
                    <ActionPlanScreen route={route} navigation={navigation} />
                </ProfileProvider>
            </SafeAreaProvider>
        )
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    // Navigate Away
    await renderer.act(async () => {
        appLevelComponent.update(
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <ProfileProvider>
                    <></>
                </ProfileProvider>
            </SafeAreaProvider>
        )
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    // Navigate Back to Chat Screen
    await renderer.act(async () => {
        appLevelComponent.update(
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <ProfileProvider>
                    <ActionPlanScreen route={route} navigation={navigation} />
                </ProfileProvider>
            </SafeAreaProvider>
        )
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    const finalCalls = mockSingle.mock.calls.length;
    console.log(`Final DB calls: ${finalCalls}`);

    // Expected improvement: The call count should remain the same after remounting the screen
    // We expect 1 call for provider, and currently +2 for each mount. We want to remove the ones on mount.
    expect(finalCalls).toEqual(initialCalls);
  });
});
