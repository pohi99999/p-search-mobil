import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaywallScreen } from '../PaywallScreen';
import { CopilotChatScreen } from '../CopilotChatScreen';
import { contrastRatio, textColor } from '../../test-utils/contrast';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }), useRoute: () => ({ params: undefined }) }));
jest.mock('../../context/BillingContext', () => ({
  useBilling: () => ({ packages: [], purchasePackage: jest.fn(), restorePurchases: jest.fn(), isLoading: false, isPro: false }),
}));
jest.mock('../../context/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'bp1' } }) }));
jest.mock('../../hooks/useCopilotChat', () => ({
  useCopilotChat: () => ({ messages: [], inputText: '', setInputText: jest.fn(), isTyping: false, handleSend: jest.fn() }),
}));
jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));

// Péter 10518: no superlative without data on the paywall and the Copilot header.
const metrics = { frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderTree = async (el: React.ReactElement) => {
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>); });
  return tree!;
};
const renderText = async (el: React.ReactElement) => JSON.stringify((await renderTree(el)).toJSON());

describe('screen claims', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('the paywall says what Pro gives, without "legfejlettebb"', async () => {
    const text = await renderText(<PaywallScreen />);
    expect(text).not.toContain('legfejlettebb');
    expect(text).toContain('Készülj fel a kiválasztott pályázatra: akcióterv, dokumentum-vázlat PDF-ben, hirdetések nélkül.');
  });

  it('the Copilot header says what it is for, not "Aktív és intelligens segítség"', async () => {
    const nav = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() } as any;
    const tree = await renderTree(<CopilotChatScreen navigation={nav} route={{ key: 'c', name: 'CopilotChat', params: { matchId: 'm1' } } as any} />);
    expect(JSON.stringify(tree.toJSON())).not.toContain('Aktív és intelligens segítség');
    const subtitle = tree.root.findAll((n) => n.props.children === 'Kérdezz a kiválasztott pályázatról' && n.props.style)[0];
    expect(subtitle).toBeDefined();
    expect(contrastRatio(textColor(subtitle.props.style), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
