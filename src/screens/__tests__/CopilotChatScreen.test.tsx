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
    canGoBack: jest.fn(() => true),
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
    canGoBack: jest.fn(() => true),
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

  it('scopes the storage key by the authenticated user id so different accounts never collide', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(
        <CopilotChatScreen navigation={mockNavigation} route={mockRoute} />
      );
    });

    expect(AsyncStorage.getItem).toHaveBeenCalledWith(
      expect.stringContaining('test-user-id')
    );
    const key = (AsyncStorage.getItem as jest.Mock).mock.calls[0][0];
    expect(key).toBe('@copilot_chat_history_test-user-id_test-match-id');

    await renderer.act(async () => {
      component.unmount();
    });
  });

  it('does not load or save chat history when there is no authenticated user', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });

    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(
        <CopilotChatScreen navigation={mockNavigation} route={mockRoute} />
      );
    });

    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    await renderer.act(async () => {
      component.unmount();
    });
  });

  it('ignores a malformed (non-array) cache entry and falls back to the welcome message', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ not: 'an array' }));

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

    expect(AsyncStorage.setItem).toHaveBeenCalled();
    const lastCall = (AsyncStorage.setItem as jest.Mock).mock.calls.at(-1);
    expect(lastCall[0]).toContain('test-match-id');
    const persisted = JSON.parse(lastCall[1]);
    expect(persisted.some((m: any) => m.text === 'Új kérdésem')).toBe(true);
    expect(persisted.some((m: any) => m.text === 'AI válasz szöveg')).toBe(true);

    await renderer.act(async () => {
      component.unmount();
    });
  });

  it('caps history to MAX_HISTORY_MESSAGES when persisting and when sending to the edge function', async () => {
    const HISTORY_CAP = 50;
    const storedMessages = Array.from({ length: HISTORY_CAP + 5 }, (_, i) => ({
      id: `m${i}`,
      text: `Üzenet ${i}`,
      sender: i % 2 === 0 ? 'user' : 'ai',
      created_at: new Date(2026, 0, 1, 0, i).toISOString(),
    }));
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(storedMessages));
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { reply: 'Új AI válasz' },
    });

    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(
        <CopilotChatScreen navigation={mockNavigation} route={mockRoute} />
      );
    });

    // A betöltés után a cache-be visszaírt másolatnak már csak az utolsó
    // HISTORY_CAP elemet szabad tartalmaznia.
    const loadPersistCall = (AsyncStorage.setItem as jest.Mock).mock.calls.at(-1);
    const persistedAfterLoad = JSON.parse(loadPersistCall[1]);
    expect(persistedAfterLoad.length).toBe(HISTORY_CAP);
    expect(persistedAfterLoad.some((m: any) => m.text === 'Üzenet 0')).toBe(false);

    const root = component!.root;
    const input = root.findByType(TextInput);

    await renderer.act(async () => {
      input.props.onChangeText('Legújabb kérdés');
    });

    await renderer.act(async () => {
      input.props.right.props.onPress();
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    // Az edge function-nek küldött history-nak is limitáltnak kell lennie.
    const invokeCall = (supabase.functions.invoke as jest.Mock).mock.calls.at(-1);
    const sentHistory = invokeCall[1].body.history;
    expect(sentHistory.length).toBeLessThanOrEqual(HISTORY_CAP);
    expect(sentHistory.some((m: any) => m.text === 'Üzenet 0')).toBe(false);

    // A frissen mentett cache-nek is csak az utolsó HISTORY_CAP üzenetet kell tartalmaznia,
    // az új üzenetekkel együtt.
    const finalPersistCall = (AsyncStorage.setItem as jest.Mock).mock.calls.at(-1);
    const finalPersisted = JSON.parse(finalPersistCall[1]);
    expect(finalPersisted.length).toBe(HISTORY_CAP);
    expect(finalPersisted.some((m: any) => m.text === 'Legújabb kérdés')).toBe(true);
    expect(finalPersisted.some((m: any) => m.text === 'Üzenet 0')).toBe(false);

    await renderer.act(async () => {
      component.unmount();
    });
  });
});
