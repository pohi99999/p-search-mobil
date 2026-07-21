import React from 'react';
import renderer from 'react-test-renderer';
import { CopilotChatScreen } from '../CopilotChatScreen';
import { supabase } from '../../lib/supabase';
import { ProfileProvider } from '../../context/ProfileContext';

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

jest.useFakeTimers();

describe('CopilotChatScreen Performance', () => {
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
            <ProfileProvider>
                <></>
            </ProfileProvider>
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
            <ProfileProvider>
                <CopilotChatScreen route={route} navigation={navigation} />
            </ProfileProvider>
        )
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    // Navigate Away
    await renderer.act(async () => {
        appLevelComponent.update(
            <ProfileProvider>
                <></>
            </ProfileProvider>
        )
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    // Navigate Back to Chat Screen
    await renderer.act(async () => {
        appLevelComponent.update(
            <ProfileProvider>
                <CopilotChatScreen route={route} navigation={navigation} />
            </ProfileProvider>
        )
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    const finalCalls = mockSingle.mock.calls.length;
    console.log(`Final DB calls: ${finalCalls}`);

    // Expected improvement: The call count should remain the same after remounting the screen
    expect(finalCalls).toEqual(initialCalls);
  });
});
