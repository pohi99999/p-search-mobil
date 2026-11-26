import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FollowButton, FOLLOW_LABEL, FOLLOWING_LABEL, FOLLOW_LIMIT_TITLE, FOLLOW_LIMIT_MESSAGE } from '../FollowButton';
import { followGrant, loadFollowed, resetFollowedForTest, setFollowRemoteForTest } from '../../lib/followedGrants';
import { createMemoryFollowRemote } from '../../test-utils/followRemote';
import { notify } from '../../lib/notify';

jest.mock('../../lib/notify', () => ({ notify: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const match = (n: number) =>
  ({ id: `m${n}`, business_id: 'b', grant_id: `g${n}`, match_score: 80, match_reasoning: '', status: 'new', created_at: '', grants: { id: `g${n}`, title: `Pályázat ${n}` } }) as any;

const render = async (props: Partial<React.ComponentProps<typeof FollowButton>> = {}) => {
  const onOpenPaywall = jest.fn();
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<FollowButton match={match(1)} userId="u1" isPro={false} onOpenPaywall={onOpenPaywall} {...props} />);
  });
  const button = () => tree!.root.findAll((n) => n.props.testID === 'follow-button' && typeof n.props.onPress === 'function')[0];
  const press = async () => {
    await act(async () => {
      button().props.onPress();
    });
    await act(async () => {});
  };
  return { tree: tree!, button, press, onOpenPaywall };
};

describe('FollowButton (round 11-21 #5)', () => {
  beforeEach(async () => {
    resetFollowedForTest();
    setFollowRemoteForTest(createMemoryFollowRemote().remote);
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('without a user id there is no button', async () => {
    const { tree } = await render({ userId: undefined });
    expect(tree.toJSON()).toBeNull();
  });

  it('follows on a press, then reads "Követed", and a second press unfollows', async () => {
    const { button, press } = await render();
    expect(button().props.children).toBe(FOLLOW_LABEL);
    expect(button().props.accessibilityLabel).toBe('Követem: Pályázat 1');
    await press();
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g1']);
    expect(button().props.children).toBe(FOLLOWING_LABEL);
    expect(button().props.accessibilityState).toEqual({ selected: true, busy: false });
    await press();
    expect(await loadFollowed('u1')).toEqual([]);
    expect(button().props.children).toBe(FOLLOW_LABEL);
  });

  it('a free account at 3 gets the limit notice with a Pro button, and nothing is stored', async () => {
    for (const n of [2, 3, 4]) await followGrant('u1', match(n), false);
    const { press, onOpenPaywall, button } = await render();
    await press();
    expect(notify).toHaveBeenCalledWith(FOLLOW_LIMIT_TITLE, FOLLOW_LIMIT_MESSAGE, expect.any(Array));
    const buttons = (notify as jest.Mock).mock.calls[0][2];
    expect(buttons.map((b: { text: string }) => b.text)).toEqual(['Rendben', 'Pro megnézése']);
    buttons[1].onPress();
    expect(onOpenPaywall).toHaveBeenCalledTimes(1);
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g2', 'g3', 'g4']);
    expect(button().props.children).toBe(FOLLOW_LABEL);
  });

  it('a Pro account follows past 3', async () => {
    // the server has u1 as Pro (no limit in the insert trigger)
    setFollowRemoteForTest(createMemoryFollowRemote({ pro: ['u1'] }).remote);
    for (const n of [2, 3, 4]) await followGrant('u1', match(n), true);
    const { press } = await render({ isPro: true });
    await press();
    expect(notify).not.toHaveBeenCalled();
    expect(await loadFollowed('u1')).toHaveLength(4);
  });

  it('the limit text names 3', () => {
    expect(FOLLOW_LIMIT_TITLE).toBe('Legfeljebb 3 pályázatot követhetsz');
    expect(FOLLOW_LIMIT_MESSAGE).toContain('3 pályázatot');
  });
});
