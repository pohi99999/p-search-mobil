import React from 'react';
import renderer from 'react-test-renderer';
import { CopilotChatScreen } from '../CopilotChatScreen';
import { supabase } from '../../lib/supabase';
import { TextInput } from 'react-native-paper';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null })
    },
    functions: {
      invoke: jest.fn()
    }
  }
}));

// Mock timer so the layout updates and component renders synchronously without warnings
jest.useFakeTimers();

describe('CopilotChatScreen Error Handling', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
    jest.clearAllMocks();
  });

  it('should display a default error message when chat-with-gemini fails', async () => {
    // Simulate an error from supabase.functions.invoke
    (supabase.functions.invoke as jest.Mock).mockRejectedValue(new Error('Network error'));

    // Create the component
    const route = { params: { matchId: null } } as any;
    const navigation = {} as any;

    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(<CopilotChatScreen route={route} navigation={navigation} />);
    });

    // Fast forward to complete initial load side effects
    await renderer.act(async () => {
      jest.runAllTimers();
    });

    const root = component!.root;

    // Find the text input
    const input = root.findByType(TextInput);

    // Type something
    await renderer.act(async () => {
      input.props.onChangeText('Test message');
    });

    // Tap the send button (trigger handleSend)
    await renderer.act(async () => {
      const sendIcon = input.props.right;
      sendIcon.props.onPress();
    });

    // Fast forward timers to clear timeouts inside the component
    await renderer.act(async () => {
      jest.runAllTimers();
    });

    // Check if the error message is displayed
    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Sajnálom, nem sikerült elérnem a P-Search AI asszisztenst: Network error');
  });

  it('should display the exact error message if it already contains "Sajnálom"', async () => {
    // Simulate an error from supabase.functions.invoke that already contains "Sajnálom"
    (supabase.functions.invoke as jest.Mock).mockRejectedValue(new Error('Sajnálom, egyedi hiba történt'));

    // Create the component
    const route = { params: { matchId: null } } as any;
    const navigation = {} as any;

    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(<CopilotChatScreen route={route} navigation={navigation} />);
    });

    // Fast forward to complete initial load side effects
    await renderer.act(async () => {
      jest.runAllTimers();
    });

    const root = component!.root;

    // Find the text input
    const input = root.findByType(TextInput);

    // Type something
    await renderer.act(async () => {
      input.props.onChangeText('Another test');
    });

    // Tap the send button (trigger handleSend)
    await renderer.act(async () => {
      const sendIcon = input.props.right;
      sendIcon.props.onPress();
    });

    // Fast forward timers to clear timeouts inside the component
    await renderer.act(async () => {
      jest.runAllTimers();
    });

    // Check if the exact error message is displayed without the default prefix
    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Sajnálom, egyedi hiba történt');
    expect(treeStr).not.toContain('nem sikerült elérnem a P-Search AI asszisztenst');
  });
});
