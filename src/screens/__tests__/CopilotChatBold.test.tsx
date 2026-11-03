import React from 'react';
import { StyleSheet } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CopilotChatScreen } from '../CopilotChatScreen';

jest.mock('../../context/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'bp1' } }) }));
jest.mock('../../hooks/useCopilotChat', () => ({
  useCopilotChat: () => ({
    messages: [
      { id: 'u1', sender: 'user', text: 'Mi a **határideje**?', created_at: new Date(2026, 9, 25, 13, 35).toISOString() },
      { id: 'a1', sender: 'ai', text: 'A beadási határidő **2026. 12. 02.**, ellenőrizd.', created_at: new Date(2026, 9, 25, 13, 35).toISOString() },
    ],
    inputText: '', setInputText: jest.fn(), isTyping: false, handleSend: jest.fn(),
  }),
}));

// #238 live chat test (Marveen 4864): the bubble showed the model's "**…**" with the asterisks.
describe('Copilot bubble bold', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('shows the AI answer bold without asterisks and keeps the user text as typed', async () => {
    const nav = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() } as any;
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <CopilotChatScreen navigation={nav} route={{ key: 'c', name: 'CopilotChat', params: { matchId: 'm1' } } as any} />
        </SafeAreaProvider>,
      );
    });
    // Only what the Text nodes draw (the FlatList's data prop still holds the raw message).
    const drawn = tree!.root
      .findAll((n) => (n.type as unknown) === 'Text')
      .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
      .filter((c): c is string => typeof c === 'string');
    expect(drawn.some((t) => t.includes('**') && t.includes('2026'))).toBe(false);
    expect(drawn).toContain('Mi a **határideje**?');
    const bold = tree!.root.findAll((n) => n.props.children === '2026. 12. 02.' && n.props.style)[0];
    expect(bold).toBeDefined();
    expect((StyleSheet.flatten(bold.props.style) as { fontWeight?: string }).fontWeight).toBe('bold');
  });
});
