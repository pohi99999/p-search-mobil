import React from 'react';
import { StyleSheet } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CopilotChatScreen } from '../CopilotChatScreen';
import { SettingsScreen } from '../SettingsScreen';

const LONG = 'TEN-T vasúti és regionális intermodális közlekedés fejlesztése a 4 legszegényebb magyarországi régió területein';

jest.mock('../../context/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'bp1' } }) }));
jest.mock('../../context/BillingContext', () => ({ useBilling: () => ({ isPro: false }) }));
jest.mock('../../hooks/useCopilotChat', () => ({
  useCopilotChat: () => ({
    messages: [{ id: 'a1', sender: 'ai', text: 'Válasz.', created_at: new Date(2026, 9, 25, 11, 36).toISOString(), sources: ['TEN-T vasúti és regionális intermodális közlekedés fejlesztése a 4 legszegényebb magyarországi régió területein'] }],
    inputText: '', setInputText: jest.fn(), isTyping: false, handleSend: jest.fn(),
  }),
}));
jest.mock('../../lib/supabase', () => {
  const single = jest.fn().mockResolvedValue({ data: { search_frequency: 'weekly', last_scan_at: null, next_scan_at: null }, error: null });
  return {
    supabase: {
      auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } }) },
      from: jest.fn(() => ({ select: () => ({ eq: () => ({ single }) }) })),
      functions: { invoke: jest.fn() },
    },
  };
});
jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));

// E2E vc 18 findings (Marveen 4801): the Copilot source tags ran out of the bubble at 390 px, and the settings
// save button sat flush against the card below it.
const metrics = { frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const mount = async (el: React.ReactElement) => {
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>); });
  return tree!;
};
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;

describe('E2E vc 18 layout fixes', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('a long source tag is no wider than the bubble and its text wraps', async () => {
    const nav = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() } as any;
    const tree = await mount(<CopilotChatScreen navigation={nav} route={{ key: 'c', name: 'CopilotChat', params: { matchId: 'm1' } } as any} />);
    const text = tree.root.findAll((n) => n.props.children === LONG && n.props.style)[0];
    expect(text).toBeDefined();
    expect(flat(text.props.style).flexShrink).toBe(1);
    const tag = text.parent!.parent!.findAll((n) => n.props.style && flat(n.props.style).backgroundColor === '#ECEFF1')[0];
    expect(flat(tag.props.style).maxWidth).toBe('100%');
  });

  it('the settings save button keeps a gap to the card below it', async () => {
    const tree = await mount(<SettingsScreen navigation={{ canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() } as any} route={{ key: 's', name: 'Settings' } as any} />);
    const save = tree.root.findAll((n) => n.props.accessibilityLabel === 'Keresési beállítások mentése' && n.props.style)[0];
    expect(save).toBeDefined();
    expect(Number(flat(save.props.style).marginBottom)).toBeGreaterThanOrEqual(16);
  });
});
