import React from 'react';
import { Linking } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GrantDetailScreen, isOpenableUrl } from '../GrantDetailScreen';
import { useBilling } from '../../context/BillingContext';
import { useProfile } from '../../context/ProfileContext';
import { useActionPlan } from '../../hooks/useActionPlan';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import type { MatchWithGrant } from '../../hooks/useHomeData';
import { setMatchFeedback } from '../../services/events';
import { metasOutsideWhitelist, trackCalls } from '../../test-utils/events';

jest.mock('../../context/BillingContext', () => ({ useBilling: jest.fn() }));
jest.mock('../../context/ProfileContext', () => ({ useProfile: jest.fn() }));
jest.mock('../../hooks/useActionPlan', () => ({ useActionPlan: jest.fn() }));
jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn() } }));

// Card [B]: the grant itself (deadline, official link, eligibility) on a free view, the Pro offer below it.
const NOW = new Date(2026, 9, 25, 10, 0, 0);

const makeMatch = (grant: Partial<MatchWithGrant['grants']> = {}, status = 'new'): MatchWithGrant => ({
  id: 'match-1',
  business_id: 'bp-1',
  grant_id: 'g-1',
  match_score: 87,
  match_reasoning: 'A cég létszáma és tevékenysége illik a kiíráshoz.',
  status,
  created_at: '',
  grants: {
    id: 'g-1',
    title: 'KKV Digitalizációs Támogatás',
    description: 'Eszközbeszerzés és felhőszolgáltatás támogatása.',
    provider: 'GINOP Plusz',
    grant_type: 'támogatás',
    amount_min: 5_000_000,
    amount_max: 25_000_000,
    deadline: new Date(2026, 11, 15, 12).toISOString(),
    eligibility_criteria: 'Legalább 1 éve működő KKV.',
    source_url: 'https://palyazat.gov.hu/kiiras',
    created_at: '',
    ...grant,
  },
} as MatchWithGrant);

const createNavigation = () =>
  ({ canGoBack: jest.fn().mockReturnValue(true), goBack: jest.fn(), navigate: jest.fn() }) as unknown as
    NativeStackNavigationProp<RootStackParamList, 'GrantDetail'>;

async function renderScreen(match: MatchWithGrant, navigation = createNavigation(), rank?: number) {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <GrantDetailScreen navigation={navigation} route={{ key: 'grant-detail', name: 'GrantDetail', params: { match, rank } }} />
      </SafeAreaProvider>,
    );
  });
  const text = JSON.stringify(tree!.toJSON());
  const byTestId = (id: string) => tree!.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
  return { tree: tree!, text, navigation, byTestId };
}

describe('GrantDetailScreen (card [B])', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    (useBilling as jest.Mock).mockReturnValue({ isPro: false });
    (useProfile as jest.Mock).mockReturnValue({ profile: { id: 'bp-1' } });
    (useActionPlan as jest.Mock).mockReturnValue({ plans: [] });
  });
  afterEach(() => jest.useRealTimers());

  it('shows the deadline, amount, provider, eligibility, description and the official link', async () => {
    const { text, byTestId } = await renderScreen(makeMatch());
    expect(text).toContain('KKV Digitalizációs Támogatás');
    expect(text).toContain('Egyezés a cégeddel: 87%');
    expect(text).toContain('2026. 12. 15.');
    expect(text).toContain('5 000 000 Ft - 25 000 000 Ft');
    expect(text).toContain('GINOP Plusz');
    expect(text).toContain('Legalább 1 éve működő KKV.');
    expect(text).toContain('Eszközbeszerzés és felhőszolgáltatás támogatása.');
    expect(byTestId('grant-detail-source')).toBeDefined();
  });

  it('opens the official link in the browser', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { byTestId } = await renderScreen(makeMatch());
    await act(async () => { byTestId('grant-detail-source').props.onPress(); });
    expect(open).toHaveBeenCalledWith('https://palyazat.gov.hu/kiiras');
  });

  it('says what is missing instead of leaving gaps, and drops the link when there is none', async () => {
    const { text, byTestId } = await renderScreen(makeMatch({ deadline: null, amount_min: null, amount_max: null, eligibility_criteria: null, source_url: null }));
    expect(text).toContain('A kiírás nem ad meg határidőt.');
    expect(text).toContain('Az összeget a kiírás nem adja meg egyértelműen');
    expect(text).toContain('A jogosultsági feltételeket a hivatalos kiírás tartalmazza.');
    expect(byTestId('grant-detail-source')).toBeUndefined();
  });

  // Card [G2]: the usage events of the detail view and its feedback buttons.
  it('opening the view records match_open with the rank and the score band', async () => {
    await renderScreen(makeMatch(), createNavigation(), 3);
    expect(trackCalls('match_open')).toEqual([['match_open', { match_id: 'match-1', grant_id: 'g-1', rank: 3, score_band: '80-100' }]]);
    expect(metasOutsideWhitelist()).toEqual([]);
  });

  it('the official link records source_link_open with the grant only', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { byTestId } = await renderScreen(makeMatch(), createNavigation(), 1);
    await act(async () => { byTestId('grant-detail-source').props.onPress(); });
    expect(trackCalls('source_link_open')).toEqual([['source_link_open', { grant_id: 'g-1' }]]);
    expect(metasOutsideWhitelist()).toEqual([]);
  });

  it('the feedback buttons are on the view and save through setMatchFeedback', async () => {
    const { byTestId } = await renderScreen(makeMatch(), createNavigation(), 2);
    await act(async () => { byTestId('feedback-not-relevant-match-1').props.onPress(); });
    expect(setMatchFeedback).toHaveBeenCalledWith({ match_id: 'match-1', grant_id: 'g-1', rank: 2, score_band: '80-100' }, 'not_relevant');
  });

  it('a free user gets the Pro offer, which goes to the paywall', async () => {
    const { byTestId, navigation } = await renderScreen(makeMatch());
    expect(byTestId('grant-detail-plan')).toBeUndefined();
    await act(async () => { byTestId('grant-detail-upgrade').props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('Paywall', { source: 'grant_detail' });
  });

  it('a Pro user goes to the action plan, labelled by whether one exists', async () => {
    (useBilling as jest.Mock).mockReturnValue({ isPro: true });
    const first = await renderScreen(makeMatch());
    expect(first.text).toContain('Akcióterv készítése');
    await act(async () => { first.byTestId('grant-detail-plan').props.onPress(); });
    expect(first.navigation.navigate).toHaveBeenCalledWith('ActionPlan', { matchId: 'match-1' });

    (useActionPlan as jest.Mock).mockReturnValue({ plans: [{ id: 'p1', match_id: 'match-1' }] });
    const again = await renderScreen(makeMatch());
    expect(again.text).toContain('Akcióterv megnyitása');
  });

  it('an expired grant shows it is closed, without the Pro offer or the plan button', async () => {
    (useBilling as jest.Mock).mockReturnValue({ isPro: true });
    const { text, byTestId } = await renderScreen(makeMatch({ deadline: new Date(2026, 9, 1, 12).toISOString() }));
    expect(text).toContain('Lejárt: 2026. 10. 01.');
    expect(text).toContain('Ez a kiírás lezárult');
    expect(byTestId('grant-detail-plan')).toBeUndefined();
    expect(byTestId('grant-detail-upgrade')).toBeUndefined();
  });

  it('the Copilot button opens the chat on this match', async () => {
    const { byTestId, navigation } = await renderScreen(makeMatch());
    await act(async () => { byTestId('grant-detail-copilot').props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('CopilotChat', { matchId: 'match-1' });
  });
});

describe('isOpenableUrl', () => {
  it('opens only http(s) links from the scraped data', () => {
    expect(isOpenableUrl('https://palyazat.gov.hu')).toBe(true);
    expect(isOpenableUrl(' http://example.hu ')).toBe(true);
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false);
    expect(isOpenableUrl('intent://x#Intent;end')).toBe(false);
    expect(isOpenableUrl('')).toBe(false);
    expect(isOpenableUrl(null)).toBe(false);
  });
});
