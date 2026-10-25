// Card [G2]: the "Hasznos / Nem releváns" buttons save the answer, a second press clears it, a failure reverts it.
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { MatchFeedback } from '../MatchFeedback';
import { MatchCard } from '../MatchCard';
import { setMatchFeedback } from '../../services/events';
import { resetMatchFeedbackStoreForTest } from '../../lib/matchFeedbackStore';
import type { MatchWithGrant } from '../../hooks/useHomeData';

jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

const ref = { match_id: 'm-1', grant_id: 'g-1', rank: 4, score_band: '60-79' };

async function render(initial: 'useful' | 'not_relevant' | null = null) {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<MatchFeedback matchId="m-1" grantId="g-1" score={65} rank={4} initial={initial} />);
  });
  const button = (id: string) => tree!.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
  const selected = (id: string) => button(id).props.accessibilityState?.selected;
  return { tree: tree!, button, selected };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetMatchFeedbackStoreForTest();
  (setMatchFeedback as jest.Mock).mockResolvedValue(undefined);
});

it('a press saves the answer with the match, its rank and score band, and marks it chosen', async () => {
  const { button, selected } = await render();
  await act(async () => { button('feedback-useful-m-1').props.onPress(); });
  expect(setMatchFeedback).toHaveBeenCalledWith(ref, 'useful');
  expect(selected('feedback-useful-m-1')).toBe(true);
  expect(selected('feedback-not-relevant-m-1')).toBe(false);
});

it('pressing the chosen answer again clears it (null)', async () => {
  const { button, selected } = await render('not_relevant');
  expect(selected('feedback-not-relevant-m-1')).toBe(true);
  await act(async () => { button('feedback-not-relevant-m-1').props.onPress(); });
  expect(setMatchFeedback).toHaveBeenCalledWith(ref, null);
  expect(selected('feedback-not-relevant-m-1')).toBe(false);
});

it('a failed save goes back to the previous answer and says so', async () => {
  (setMatchFeedback as jest.Mock).mockRejectedValue(new Error('match not found'));
  const { tree, button, selected } = await render('useful');
  await act(async () => { button('feedback-not-relevant-m-1').props.onPress(); });
  expect(selected('feedback-useful-m-1')).toBe(true);
  expect(selected('feedback-not-relevant-m-1')).toBe(false);
  expect(JSON.stringify(tree.toJSON())).toContain('Nem sikerült menteni');
});

it('the match card shows the buttons only when it knows its rank', async () => {
  const item = { id: 'm-1', grant_id: 'g-1', match_score: 65, status: 'new', grants: { title: 'T' } } as unknown as MatchWithGrant;
  let withRank: renderer.ReactTestRenderer;
  let withoutRank: renderer.ReactTestRenderer;
  await act(async () => { withRank = renderer.create(<MatchCard item={item} onPress={jest.fn()} rank={1} />); });
  await act(async () => { withoutRank = renderer.create(<MatchCard item={item} onPress={jest.fn()} />); });
  const has = (t: renderer.ReactTestRenderer) => t.root.findAll((n) => n.props.testID === 'feedback-useful-m-1').length > 0;
  expect(has(withRank!)).toBe(true);
  expect(has(withoutRank!)).toBe(false);
});

it('an answer given on one (the detail view) shows on the other (the card still mounted under it)', async () => {
  let card: renderer.ReactTestRenderer;
  let detail: renderer.ReactTestRenderer;
  await act(async () => { card = renderer.create(<MatchFeedback matchId="m-1" grantId="g-1" score={65} rank={4} initial={null} />); });
  await act(async () => { detail = renderer.create(<MatchFeedback matchId="m-1" grantId="g-1" score={65} rank={4} initial={null} />); });
  const btn = (t: renderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
  await act(async () => { btn(detail!, 'feedback-not-relevant-m-1').props.onPress(); });
  expect(btn(card!, 'feedback-not-relevant-m-1').props.accessibilityState.selected).toBe(true);
  // A different match is not affected.
  let other: renderer.ReactTestRenderer;
  await act(async () => { other = renderer.create(<MatchFeedback matchId="m-2" grantId="g-2" score={65} rank={5} initial={null} />); });
  expect(btn(other!, 'feedback-not-relevant-m-2').props.accessibilityState.selected).toBe(false);
});
