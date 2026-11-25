import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FollowedGrantsScreen, FOLLOWED_EMPTY, FOLLOWED_EMPTY_ACTION, CLOSED_AT_SOURCE, followedCountLine } from '../FollowedGrantsScreen';
import { followGrant, loadFollowed, resetFollowedForTest, setFollowRemoteForTest } from '../../lib/followedGrants';
import { createMemoryFollowRemote } from '../../test-utils/followRemote';
import { useBilling } from '../../context/BillingContext';
import { useProfile } from '../../context/ProfileContext';
import { supabase } from '../../lib/supabase';

jest.mock('../../context/BillingContext', () => ({ useBilling: jest.fn() }));
jest.mock('../../context/ProfileContext', () => ({ useProfile: jest.fn() }));
jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const NOW = new Date(2026, 10, 21, 10, 0);
const match = (n: number, deadline: Date | null) =>
  ({
    id: `m${n}`, business_id: 'b', grant_id: `g${n}`, match_score: 80, match_reasoning: '', status: 'new', created_at: '',
    grants: { id: `g${n}`, title: `Pályázat ${n}`, deadline: deadline ? deadline.toISOString() : null },
  }) as any;

let mockRows: unknown[] = [];
const grantsRead = () => ({ select: () => ({ in: (_c: string, ids: string[]) => Promise.resolve({ data: (mockRows as { id: string }[]).filter((r) => ids.includes(r.id)), error: null }) }) });

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) } as any;

const render = async () => {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <FollowedGrantsScreen navigation={navigation} route={{ key: 'f', name: 'FollowedGrants' } as any} />
      </SafeAreaProvider>,
    );
  });
  await act(async () => {});
  return tree!;
};
const strings = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string').map((n) => n.props.children as string);
const byTestId = (tree: renderer.ReactTestRenderer, id: string) =>
  tree.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function');

describe('FollowedGrantsScreen (round 11-21 #5)', () => {
  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    resetFollowedForTest();
    setFollowRemoteForTest(createMemoryFollowRemote().remote);
    await AsyncStorage.clear();
    mockRows = [];
    (supabase.from as jest.Mock).mockImplementation(grantsRead);
    (useBilling as jest.Mock).mockReturnValue({ isPro: false });
    (useProfile as jest.Mock).mockReturnValue({ profile: { id: 'bp', user_id: 'u1' } });
  });
  afterEach(() => jest.useRealTimers());

  it('says how to follow when the list is empty', async () => {
    const tree = await render();
    expect(strings(tree)).toContain(FOLLOWED_EMPTY);
  });

  it('lists the nearest deadline first, with the countdown and the free counter', async () => {
    await followGrant('u1', match(1, new Date(2026, 11, 20)), false);
    await followGrant('u1', match(2, new Date(2026, 10, 25)), false);
    await followGrant('u1', match(3, null), false);
    const tree = await render();
    const deadlines = tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'followed-deadline').map((n) => n.props.children);
    expect(deadlines).toEqual([
      `Beadás: ${new Date(2026, 10, 25).toLocaleDateString('hu-HU')} (még 4 nap)`,
      `Beadás: ${new Date(2026, 11, 20).toLocaleDateString('hu-HU')} (még 29 nap)`,
      'Beadási határidő: nincs megadva',
    ]);
    expect(strings(tree)).toContain(followedCountLine(3, false));
    expect(followedCountLine(3, false)).toBe('3 / 3 követett pályázat (ingyenes fiók)');
    expect(followedCountLine(5, true)).toBe('5 követett pályázat');
  });

  it("today's grant row wins: a moved deadline and a closing at the source show", async () => {
    await followGrant('u1', match(1, new Date(2026, 11, 20)), false);
    await followGrant('u1', match(2, new Date(2026, 11, 22)), false);
    mockRows = [
      { id: 'g1', title: 'Pályázat 1', deadline: new Date(2026, 10, 30).toISOString(), source_closed_at: null },
      { id: 'g2', title: 'Pályázat 2', deadline: new Date(2026, 11, 22).toISOString(), source_closed_at: '2026-11-20T00:00:00Z' },
    ];
    const tree = await render();
    const deadlines = tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'followed-deadline').map((n) => n.props.children);
    expect(deadlines).toEqual([`Beadás: ${new Date(2026, 10, 30).toLocaleDateString('hu-HU')} (még 9 nap)`, CLOSED_AT_SOURCE]);
  });

  it('a tap opens the detail view with the match; the remove button unfollows', async () => {
    await followGrant('u1', match(1, new Date(2026, 11, 20)), false);
    const tree = await render();
    await act(async () => { byTestId(tree, 'followed-open')[0].props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('GrantDetail', { match: expect.objectContaining({ id: 'm1', grant_id: 'g1' }) });
    const remove = byTestId(tree, 'followed-remove')[0];
    expect(remove.props.accessibilityLabel).toBe('Követés leállítása: Pályázat 1');
    await act(async () => { remove.props.onPress(); });
    await act(async () => {});
    expect(await loadFollowed('u1')).toEqual([]);
    expect(strings(tree)).toContain(FOLLOWED_EMPTY);
  });

  it('round 6 (P2-4): the empty list has a way on to the matches', async () => {
    const tree = await render();
    expect(strings(tree)).toContain(FOLLOWED_EMPTY_ACTION);
    const btn = byTestId(tree, 'followed-empty-home')[0];
    expect(btn).toBeDefined();
    act(() => btn.props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('Home');
    // AA on the page grey (#f5f5f5): #1565C0 is 5.2:1, the theme's old #1976D2 was 4.22:1 (measured in the browser).
    const button = tree.root.findAll((n) => n.props.testID === 'followed-empty-home' && n.props.textColor !== undefined)[0];
    expect(button.props.textColor).toBe('#1565C0');
  });

  it('round 6 (P2-4): the heading looks like the detail and the settings headings (navy, bold)', async () => {
    const tree = await render();
    const h = tree.root.findAll((n) => typeof n.type === 'string' && n.props.role === 'heading')[0];
    const style = Object.assign({}, ...[h.props.style].flat(Infinity).filter(Boolean));
    expect(style.fontWeight).toBe('bold');
    expect(style.color).toBe('#1A237E');
  });

  it('the screen is a level-1 heading "Saját pályázataim"', async () => {
    const tree = await render();
    const h = tree.root.findAll((n) => typeof n.type === 'string' && n.props.role === 'heading');
    expect(h.map((n) => [n.props['aria-level'], n.props.children])).toEqual([[1, 'Saját pályázataim']]);
  });
});
