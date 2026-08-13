import React from 'react';
import renderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CopilotChatScreen } from '../CopilotChatScreen';
import { supabase } from '../../lib/supabase';
import { TextInput } from 'react-native-paper';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock Supabase globally for all tests in this file
jest.mock('../../lib/supabase', () => ({
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

describe('CopilotChatScreen Error Handling', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // For error handling tests, mock session as null to test fallback
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: null });
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
    jest.clearAllMocks();
  });

  it('should display a default error message when chat-with-gemini fails', async () => {
    // Simulate an error from supabase.functions.invoke
    (supabase.functions.invoke as jest.Mock).mockRejectedValue(new Error('Network error'));

    const route = { params: { matchId: null } } as any;
    const navigation = {} as any;

    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(<CopilotChatScreen route={route} navigation={navigation} />);
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    const root = component!.root;
    const input = root.findByType(TextInput);

    await renderer.act(async () => {
      input.props.onChangeText('Test message');
    });

    await renderer.act(async () => {
      const sendIcon = input.props.right;
      sendIcon.props.onPress();
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Sajnálom, nem sikerült elérnem a P-Search AI asszisztenst: Network error');
  });

  it('should display the exact error message if it already contains "Sajnálom"', async () => {
    (supabase.functions.invoke as jest.Mock).mockRejectedValue(new Error('Sajnálom, egyedi hiba történt'));

    const route = { params: { matchId: null } } as any;
    const navigation = {} as any;

    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(<CopilotChatScreen route={route} navigation={navigation} />);
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    const root = component!.root;
    const input = root.findByType(TextInput);

    await renderer.act(async () => {
      input.props.onChangeText('Another test');
    });

    await renderer.act(async () => {
      const sendIcon = input.props.right;
      sendIcon.props.onPress();
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Sajnálom, egyedi hiba történt');
    expect(treeStr).not.toContain('nem sikerült elérnem a P-Search AI asszisztenst');
  });
});

describe('CopilotChatScreen Empty Input Behavior', () => {
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
    // For these tests, mock active session
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'test-user-id' } } }
    });
  });

  afterEach(() => {
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
    const textInput = root.findByType(TextInput);

    await renderer.act(async () => {
      textInput.props.onChangeText('');
    });

    const sendButton = textInput.props.right;
    const sendAction = sendButton.props.onPress;

    await renderer.act(async () => {
      if (sendAction) {
        await sendAction();
      }
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    expect(supabase.functions.invoke).not.toHaveBeenCalled();

    await renderer.act(async () => {
      component.unmount();
    });
  });

  it('calls navigation.goBack when the back button is pressed', async () => {
    let component: renderer.ReactTestRenderer;

    await renderer.act(async () => {
      component = renderer.create(
        <CopilotChatScreen navigation={mockNavigation} route={mockRoute} />
      );
    });

    const root = component!.root;
    const backButton = root.findByProps({ testID: 'copilot-chat-back-button' });

    await renderer.act(async () => {
      backButton.props.onPress();
    });

    expect(mockNavigation.goBack).toHaveBeenCalled();

    await renderer.act(async () => {
      component.unmount();
    });
  });
});

describe('CopilotChatScreen Chat History Persistence', () => {
  const mockNavigation: any = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  };

  const mockRoute: any = {
    params: {
      matchId: 'test-match-id',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'test-user-id' } } },
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('loads persisted chat history from AsyncStorage on mount', async () => {
    const storedMessages = [
      { id: 'm1', text: 'Korábbi kérdésem', sender: 'user', created_at: '2026-08-01T10:00:00.000Z' },
      { id: 'm2', text: 'Korábbi AI válasz', sender: 'ai', created_at: '2026-08-01T10:00:05.000Z' },
    ];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(storedMessages));

    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(
        <CopilotChatScreen navigation={mockNavigation} route={mockRoute} />
      );
    });

    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Korábbi kérdésem');
    expect(treeStr).toContain('Korábbi AI válasz');
    expect(treeStr).not.toContain('Szia! Én vagyok a P-Search AI asszisztense');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(expect.stringContaining('test-match-id'));

    await renderer.act(async () => {
      component.unmount();
    });
  });

  it('falls back to the default welcome message when no persisted history exists', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(
        <CopilotChatScreen navigation={mockNavigation} route={mockRoute} />
      );
    });

    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Szia! Én vagyok a P-Search AI asszisztense');

    await renderer.act(async () => {
      component.unmount();
    });
  });

  it('persists messages to AsyncStorage after sending a message', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { reply: 'AI válasz szöveg' },
    });

    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(
        <CopilotChatScreen navigation={mockNavigation} route={mockRoute} />
      );
    });

    const root = component!.root;
    const input = root.findByType(TextInput);

    await renderer.act(async () => {
      input.props.onChangeText('Új kérdésem');
    });

    await renderer.act(async () => {
      input.props.right.props.onPress();
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    const lastCall = (AsyncStorage.setItem as jest.Mock).mock.calls.at(-1);
    expect(lastCall[0]).toContain('test-match-id');
    const persisted = JSON.parse(lastCall[1]);
    expect(persisted.some((m: any) => m.text === 'Új kérdésem')).toBe(true);
    expect(persisted.some((m: any) => m.text === 'AI válasz szöveg')).toBe(true);

    await renderer.act(async () => {
      component.unmount();
    });
  });
});
