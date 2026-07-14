import React from 'react';
import renderer from 'react-test-renderer';
import { CopilotChatScreen } from './CopilotChatScreen';
import { supabase } from '../lib/supabase';
import { TextInput } from 'react-native-paper';

// Mock Supabase
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'test-user-id' } } }
      })
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'test-business-id' }
          })
        })
      })
    }),
    functions: {
      invoke: jest.fn().mockResolvedValue({
        data: { text: 'Test AI response' }
      })
    }
  }
}));

// Provide timers mock to resolve tearing down issues with setTimeout used inside React Native Paper and FlatList components
jest.useFakeTimers();

describe('CopilotChatScreen', () => {
  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  };

  const mockRoute: any = {
    params: {
      matchId: 'test-match-id',
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clear pending timers to avoid issues on teardown
    jest.clearAllTimers();
  });

  it('does not send a message or invoke AI function if input is empty', async () => {
    let component: renderer.ReactTestRenderer;

    await renderer.act(async () => {
      component = renderer.create(
        <CopilotChatScreen navigation={mockNavigation} route={mockRoute} />
      );
    });

    const root = component!.root;

    // Find the input element (which holds the current text value)
    const textInput = root.findByType(TextInput);

    // By default, text is empty, but let's make explicitly sure by firing onChangeText with empty string
    await renderer.act(async () => {
        textInput.props.onChangeText('');
    });

    // Find the send icon button
    const sendButton = textInput.props.right;
    const sendAction = sendButton.props.onPress;

    // Attempt to send
    await renderer.act(async () => {
        if(sendAction) {
           await sendAction();
        }
    });

    // Ensure that any pending promises or timeouts resolve
    await renderer.act(async () => {
        jest.runAllTimers();
    });

    // Supabase invoke should NOT have been called
    expect(supabase.functions.invoke).not.toHaveBeenCalled();

    // unmount manually to prevent teardown warnings
    await renderer.act(async () => {
      component.unmount();
    });
  });
});
