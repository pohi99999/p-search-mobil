import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { contrastRatio } from '../../test-utils/contrast';
import { HomeScreen, FAB_IDLE_LABEL, FAB_SEARCHING_LABEL } from '../HomeScreen';
import { useHomeData } from '../../hooks/useHomeData';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// We need to properly mock react-native using a full mock, not requireActual, to avoid TurboModule errors in React 19 testing
jest.mock('react-native', () => {
  return {
    View: 'View',
    ActivityIndicator: 'ActivityIndicator',
    FlatList: 'FlatList',
    StyleSheet: {
      create: (styles: any) => styles,
      hairlineWidth: 1,
      flatten: jest.fn(),
    },
    Platform: {
        OS: 'ios',
        select: jest.fn((objs) => objs.ios || objs.default),
        isTesting: true,
    },
    NativeModules: {
        PlatformConstants: {
            forceTouchAvailable: false,
        },
        DevMenu: {}
    },
    TurboModuleRegistry: {
        get: jest.fn(),
        getEnforcing: jest.fn(),
    },
    Animated: {
        timing: jest.fn(() => ({ start: jest.fn() })),
        Value: jest.fn(() => ({ interpolate: jest.fn() })),
        createAnimatedComponent: jest.fn((c) => c)
    },
    Easing: {
        bezier: jest.fn(),
        out: jest.fn(),
        ease: jest.fn(),
        in: jest.fn(),
    },
    Dimensions: {
        get: jest.fn().mockReturnValue({ width: 0, height: 0 }),
    },
    InteractionManager: {
        runAfterInteractions: jest.fn((cb) => cb()),
    },
    Keyboard: {
        dismiss: jest.fn(),
    },
    UIManager: {
        getViewManagerConfig: jest.fn(),
    }
  };
});

jest.mock('react-native-paper', () => {
    return {
        Text: 'Text',
        Button: 'Button',
        FAB: 'FAB',
        AnimatedFAB: 'AnimatedFAB',
        IconButton: 'IconButton',
        MD3Colors: { primary50: '#000000' }
    }
});

jest.mock('react-native-purchases', () => {
    return {
        default: {
            configure: jest.fn(),
            getCustomerInfo: jest.fn(),
            getOfferings: jest.fn(),
            purchasePackage: jest.fn(),
            restorePurchases: jest.fn(),
        },
        PURCHASES_ERROR_CODE: {
            PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR'
        }
    };
});

// mockInsets.bottom is set per test to measure the edge-to-edge layout (card bc8e4135).
const mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: jest.fn().mockImplementation(({ children }) => children),
  SafeAreaConsumer: jest.fn().mockImplementation(({ children }) => children(mockInsets)),
  useSafeAreaInsets: jest.fn(() => mockInsets),
}));

jest.mock('../../hooks/useHomeData');
jest.mock('../../components/AdBanner', () => ({
  AdBanner: 'AdBanner',
}));
jest.mock('../../components/TesterProgress', () => ({
  TesterProgress: 'TesterProgress',
}));
jest.mock('react-native-google-mobile-ads', () => ({
  BannerAd: 'BannerAd',
  BannerAdSize: { BANNER: 'BANNER' },
  TestIds: { BANNER: 'test-banner' },
}));
jest.mock('../../components/HomeEmptyState', () => ({
  HomeEmptyState: 'HomeEmptyState',
}));
jest.mock('../../components/HomeLoadError', () => ({
  HomeLoadError: 'HomeLoadError',
}));
jest.mock('../../components/MatchCard', () => ({
  MatchCard: 'MatchCard',
}));
jest.mock('../../components/HomeStatusHeader', () => ({
  HomeStatusHeader: 'HomeStatusHeader',
}));
// Round 11-21 (#2, #4): set per test; by default a first visit and no freshness line.
const mockHomeStatus: { previousVisit: string | null | undefined; freshness: unknown } = { previousVisit: null, freshness: null };
jest.mock('../../hooks/useHomeStatus', () => ({
  useHomeStatus: jest.fn(() => mockHomeStatus),
}));
jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));
jest.mock('../../lib/supabase', () => ({
    supabase: {}
}));

describe('HomeScreen', () => {
  const mockNavigation = {
    navigate: jest.fn(),
    replace: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderScreen = () => {
    let root: any;
    act(() => {
        root = renderer.create(
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <HomeScreen navigation={mockNavigation} />
            </SafeAreaProvider>
        );
    });
    return root;
  }

  it('renders loading state correctly', () => {
    (useHomeData as jest.Mock).mockReturnValue({
      loading: true,
      profile: null,
      matches: [],
      isPro: false,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch: jest.fn(),
    });

    const root = renderScreen();
    expect(root.root.findByType('ActivityIndicator')).toBeTruthy();
  });

  it('renders empty state when there are no matches', () => {
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      profile: { company_name: 'Test Company', industry_code: '123' },
      matches: [],
      isPro: false,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch: jest.fn(),
    });

    const root = renderScreen();
    expect(root.root.findByType('HomeEmptyState')).toBeTruthy();
  });

  // Round 4 P1-1, P1-2: the failure is named, Újra only reads again, and no search can start from this state.
  describe('load errors', () => {
    const failed = (loadError: 'profile' | 'matches', matches: any[] = []) => {
      const hook = {
        loading: false,
        loadError,
        profile: loadError === 'profile' ? null : { company_name: 'Test Company' },
        matches,
        isPro: false,
        fetchData: jest.fn(),
        retryLoad: jest.fn().mockResolvedValue(undefined),
        signOut: jest.fn(),
        handleNewSearch: jest.fn(),
      };
      (useHomeData as jest.Mock).mockReturnValue(hook);
      return { hook, root: renderScreen() };
    };
    const fabs = (root: any) => root.root.findAll((n: any) => n.props.testID === 'new-search-fab');

    it.each(['profile', 'matches'] as const)('%s: the error state, without the empty state and the search button', (kind) => {
      const { root } = failed(kind);
      expect(root.root.findByType('HomeLoadError').props.kind).toBe(kind);
      expect(root.root.findAllByType('HomeEmptyState')).toHaveLength(0);
      expect(fabs(root)).toHaveLength(0);
    });

    it('Újra calls retryLoad, not the search', () => {
      const { root, hook } = failed('matches');
      act(() => { root.root.findByType('HomeLoadError').props.onRetry(); });
      expect(hook.retryLoad).toHaveBeenCalledTimes(1);
      expect(hook.handleNewSearch).not.toHaveBeenCalled();
    });

    it('a failed reload with a list on the screen keeps the list and the search button', () => {
      const { root } = failed('matches', [{ id: 'm1', status: 'new', match_score: 90 }]);
      expect(root.root.findAllByType('HomeLoadError')).toHaveLength(0);
      expect(root.root.findAllByType('FlatList').length).toBeGreaterThan(0);
      expect(fabs(root).length).toBeGreaterThan(0);
    });

    it('no load error: the empty state and the search button, as before', () => {
      (useHomeData as jest.Mock).mockReturnValue({
        loading: false, loadError: null, profile: {}, matches: [], isPro: false,
        fetchData: jest.fn(), retryLoad: jest.fn(), signOut: jest.fn(), handleNewSearch: jest.fn(),
      });
      const root = renderScreen();
      expect(root.root.findAllByType('HomeLoadError')).toHaveLength(0);
      expect(root.root.findByType('HomeEmptyState')).toBeTruthy();
      expect(fabs(root).length).toBeGreaterThan(0);
    });
  });

  // Card [D]: the empty home picks one of three states from the hook's searching / hasSearched.
  it.each([
    [{ searching: true, hasSearched: false }, 'searching'],
    [{ searching: false, hasSearched: false }, 'never'],
    [{ searching: false, hasSearched: true }, 'none'],
    [{ searching: true, hasSearched: true }, 'searching'],
  ])('empty state for %j is %s', (flags, kind) => {
    const handleNewSearch = jest.fn();
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      ...flags,
      profile: { company_name: 'Test Company', industry_code: null },
      matches: [],
      isPro: false,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch,
    });

    const root = renderScreen();
    const empty = root.root.findByType('HomeEmptyState');
    expect(empty.props.kind).toBe(kind);
    expect(empty.props.profileIncomplete).toBe(true);
    empty.props.onSearch();
    expect(handleNewSearch).toHaveBeenCalled();
    empty.props.onEditProfile();
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Onboarding', { edit: true });
  });

  // Card [B]: "Részletek" opens the grant's detail view, not the action plan.
  it('the card opens the grant detail view with the match', () => {
    const match = { id: '1', match_score: 80, grants: { title: 'Pályázat' } };
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      profile: { company_name: 'Test Company' },
      matches: [match],
      isPro: false,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch: jest.fn(),
    });

    const root = renderScreen();
    const list = root.root.findByType('FlatList');
    const card = list.props.renderItem({ item: match, index: 0 });
    act(() => { card.props.onPress(); });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('GrantDetail', { match, rank: 1 });
    expect(mockNavigation.navigate).not.toHaveBeenCalledWith('ActionPlan', expect.anything());
  });

  // Card [I]: the FAB label was the MD3 default #21005D on #1976D2, 3.73:1.
  it('the search button label meets WCAG AA on the button blue', () => {
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      profile: { company_name: 'Test Company' },
      matches: [{ id: '1', grants: {} }],
      isPro: false,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch: jest.fn(),
    });
    const root = renderScreen();
    const fab = root.root.findByProps({ testID: 'new-search-fab' });
    expect(contrastRatio(fab.props.color, '#1976D2')).toBeGreaterThanOrEqual(4.5);
  });

  // Péter 10518: while searching, the FAB label stayed greyed out (Paper's disabled colours) and overflowed on web.
  it.each([true, false])('the search button keeps a readable label and only searches when idle (searching=%s)', (searching) => {
    const handleNewSearch = jest.fn();
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      searching,
      hasSearched: true,
      profile: { company_name: 'Test Company' },
      matches: [{ id: '1', grants: {} }],
      isPro: false,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch,
    });
    const root = renderScreen();
    const fab = root.root.findByProps({ testID: 'new-search-fab' });
    expect(fab.props.disabled).toBeFalsy();
    expect(contrastRatio(fab.props.color, '#1976D2')).toBeGreaterThanOrEqual(4.5);
    expect(fab.props.accessibilityState).toEqual({ busy: searching, disabled: searching });
    act(() => { fab.props.onPress(); });
    expect(handleNewSearch).toHaveBeenCalledTimes(searching ? 0 : 1);
    expect(fab.props.label).toBe(searching ? FAB_SEARCHING_LABEL : FAB_IDLE_LABEL);
  });

  // Paper places a static-icon FAB label by its width; a longer searching label ran out of the button on web.
  it('the searching label is not longer than the idle label', () => {
    expect(FAB_SEARCHING_LABEL.length).toBeLessThanOrEqual(FAB_IDLE_LABEL.length);
  });

  // Owner decision 2026-10-04 (card bc8e4135): no ad inside the list, only the bottom banner.
  it.each([false, true])('never inserts an ad into the list (isPro=%s)', (isPro) => {
    const mockMatches = [
      { id: '1', title: 'Match 1', grants: {} },
      { id: '2', title: 'Match 2', grants: {} },
    ];
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      profile: { company_name: 'Test Company' },
      matches: mockMatches,
      isPro,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch: jest.fn(),
    });

    const root = renderScreen();
    const data = root.root.findByType('FlatList').props.data;
    expect(data).toEqual(mockMatches);
    expect(root.root.findAll((n) => (n.type as unknown) === 'BannerAd')).toHaveLength(0);
  });

  // Owner test 2026-10-04: the FAB sat on the banner / under the navigation bar.
  it('keeps the FAB above the navigation-bar inset, and above the banner once it is measured', () => {
    mockInsets.bottom = 48;
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      profile: { company_name: 'Test' },
      matches: [{ id: '1', title: 'Match 1', grants: {} }],
      isPro: false,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch: jest.fn(),
    });
    const root = renderScreen();
    const fabBottom = () => {
      const fab = root.root.find((n) => n.props.testID === 'new-search-fab' && n.props.style !== undefined);
      return [fab.props.style].flat(3).reduce((acc: Record<string, unknown>, x: Record<string, unknown>) => ({ ...acc, ...(x || {}) }), {}).bottom;
    };
    expect(fabBottom()).toBe(48 + 4);

    const banner = root.root.find((n) => (n.type as unknown) === 'AdBanner');
    act(() => {
      banner.props.onHeightChange(98);
    });
    expect(fabBottom()).toBe(98 + 4);
    mockInsets.bottom = 0;
  });

  // Péter's test 2026-11-07 (P2-3): the wide button sat on "Részletek" at the top of the list too.
  it.each([
    ['a list', [{ id: '1', grants: {} }], false, false],
    ['a list while searching', [{ id: '1', grants: {} }], true, true],
    ['the empty screen', [], false, true],
  ])('on %s the search button is extended: %#', (_name, matches, searching, extended) => {
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      searching,
      profile: { company_name: 'Test' },
      matches,
      isPro: false,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch: jest.fn(),
    });
    const root = renderScreen();
    const fab = root.root.find((n) => n.props.testID === 'new-search-fab' && typeof n.type === 'string');
    expect(fab.props.extended).toBe(extended);
  });

  // Péter's test 2026-11-07: pinned above the list, the tester card took the phone's height from the matches.
  it('the tester card scrolls with the list', () => {
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      profile: { company_name: 'Test' },
      matches: [{ id: '1', grants: {} }],
      isPro: false,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch: jest.fn(),
    });
    const root = renderScreen();
    const list = root.root.findByType('FlatList');
    // Round 11-21: the header holds the tester card first, then the status lines (HomeStatusHeader).
    const headerChildren = [].concat(list.props.ListHeaderComponent.props.children) as any[];
    expect(headerChildren[0]?.type).toBe('TesterProgress');
    expect(headerChildren[1]?.type).toBe('HomeStatusHeader');
    expect(root.root.findAll((n) => n.type === 'TesterProgress' && n.parent?.type !== 'FlatList')).toHaveLength(0);
  });

  it('calls handleNewSearch on FAB press', () => {
    const mockHandleNewSearch = jest.fn();
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      profile: { company_name: 'Test' },
      matches: [{ id: '1' }],
      isPro: false,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch: mockHandleNewSearch,
    });

    const root = renderScreen();
    const fab = root.root.find((n) => n.props.testID === 'new-search-fab' && typeof n.type === 'string');
    act(() => {
      fab.props.onPress();
    });

    expect(mockHandleNewSearch).toHaveBeenCalled();
  });

  // Round 2 (Lumen P2-8): sign-out moved to Settings behind a confirmation; one tap next to the cog logged
  // the user out, and the text button squeezed the company name onto three lines.
  it('the header has no one-tap sign-out', () => {
    const mockSignOut = jest.fn();
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      profile: { company_name: 'Test' },
      matches: [{ id: '1' }],
      isPro: false,
      fetchData: jest.fn(),
      signOut: mockSignOut,
      handleNewSearch: jest.fn(),
    });

    const root = renderScreen();
    const labels = root.root
      .findAll((n) => typeof n.props.accessibilityLabel === 'string')
      .map((n) => n.props.accessibilityLabel as string);
    expect(labels).toContain('Beállítások megnyitása');
    expect(labels.some((l) => /kijelentkez/i.test(l))).toBe(false);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  // Owner decision 2026-10-04 (Telegram 6053): no test ad unit may ship from the Home screen.
  // Card 4762e3d7: fresh matches first, the stale ones in a collapsed "Korábbi találatok (N)" section below.
  describe('stale matches section', () => {
    const fresh1 = { id: 'f1', status: 'new', match_score: 90, grants: { title: 'Friss 1' } };
    const fresh2 = { id: 'f2', status: 'viewed', match_score: 70, grants: { title: 'Friss 2' } };
    const stale1 = { id: 's1', status: 'stale', match_score: 85, grants: { title: 'Régi 1' } };
    const stale2 = { id: 's2', status: 'stale', match_score: 60, grants: { title: 'Régi 2' } };
    const withMatches = (matches: any[]) =>
      (useHomeData as jest.Mock).mockReturnValue({
        loading: false, profile: { company_name: 'Test Company' }, matches, isPro: false,
        fetchData: jest.fn(), signOut: jest.fn(), handleNewSearch: jest.fn(),
      });
    const footerOf = (root: any) => {
      let footer: any;
      act(() => { footer = renderer.create(root.root.findByType('FlatList').props.ListFooterComponent); });
      return footer;
    };

    it('lists only the fresh matches; the stale ones sit behind a collapsed toggle with their count', () => {
      withMatches([fresh1, fresh2, stale1, stale2]);
      const root = renderScreen();
      expect(root.root.findByType('FlatList').props.data.map((m: any) => m.id)).toEqual(['f1', 'f2']);
      const footer = footerOf(root);
      const toggle = footer.root.findByProps({ testID: 'home-stale-toggle' });
      expect(toggle.props.children).toBe('Korábbi találatok (2)');
      expect(toggle.props.accessibilityState).toEqual({ expanded: false });
      expect(footer.root.findAllByType('MatchCard')).toHaveLength(0);
    });

    it('opens on press, shows the stale cards with their rank continuing the list, and closes again', () => {
      withMatches([fresh1, fresh2, stale1, stale2]);
      const root = renderScreen();
      const closedToggle = footerOf(root).root.findByProps({ testID: 'home-stale-toggle' });
      act(() => { closedToggle.props.onPress(); });
      const open = footerOf(root);
      const cards = open.root.findAllByType('MatchCard');
      expect(cards.map((c: any) => [c.props.item.id, c.props.rank])).toEqual([['s1', 3], ['s2', 4]]);
      act(() => { cards[0].props.onPress(); });
      expect(mockNavigation.navigate).toHaveBeenCalledWith('GrantDetail', { match: stale1, rank: 3 });
      const openToggle = open.root.findByProps({ testID: 'home-stale-toggle' });
      expect(openToggle.props.accessibilityState).toEqual({ expanded: true });
      act(() => { openToggle.props.onPress(); });
      expect(footerOf(root).root.findAllByType('MatchCard')).toHaveLength(0);
    });

    it('no stale match: no section at all', () => {
      withMatches([fresh1, fresh2]);
      const root = renderScreen();
      expect(root.root.findByType('FlatList').props.ListFooterComponent).toBeNull();
    });

    it('only stale matches: the section starts open, so the list is never just a header', () => {
      withMatches([stale1, stale2]);
      const root = renderScreen();
      expect(root.root.findByType('FlatList').props.data).toEqual([]);
      const footer = footerOf(root);
      expect(footer.root.findByProps({ testID: 'home-stale-toggle' }).props.accessibilityState).toEqual({ expanded: true });
      expect(footer.root.findAllByType('MatchCard').map((c: any) => c.props.rank)).toEqual([1, 2]);
    });
  });

  it('the Home screen source uses no AdMob test unit', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'HomeScreen.tsx'), 'utf8');
    expect(src).not.toMatch(/TestIds/);
  });
  // Review 2026-11-03: the closed-test progress card is behind EXPO_PUBLIC_SHOW_TESTER_PROGRESS, on unless exactly "false".
  describe('tester progress flag', () => {
    const saved = process.env.EXPO_PUBLIC_SHOW_TESTER_PROGRESS;
    afterEach(() => {
      if (saved === undefined) delete process.env.EXPO_PUBLIC_SHOW_TESTER_PROGRESS;
      else process.env.EXPO_PUBLIC_SHOW_TESTER_PROGRESS = saved;
    });

    it.each([
      [undefined, 1],
      ['true', 1],
      ['', 1],
      ['FALSE', 1],
      ['0', 1],
      ['false', 0],
    ])('EXPO_PUBLIC_SHOW_TESTER_PROGRESS=%p shows the card %i time(s)', (value, count) => {
      if (value === undefined) delete process.env.EXPO_PUBLIC_SHOW_TESTER_PROGRESS;
      else process.env.EXPO_PUBLIC_SHOW_TESTER_PROGRESS = value;
      (useHomeData as jest.Mock).mockReturnValue({
        loading: false,
        profile: { company_name: 'Test Company' },
        matches: [],
        isPro: false,
        fetchData: jest.fn(),
        signOut: jest.fn(),
        handleNewSearch: jest.fn(),
      });
      const root = renderScreen();
      expect(root.root.findAllByType('TesterProgress')).toHaveLength(count);
    });
  });
});

// Round 11-21 (#2, #4): the matches since the previous visit are marked, and the header gets the count and freshness.
describe('round 11-21: new since the previous visit', () => {
  const { useHomeStatus } = require('../../hooks/useHomeStatus');
  const match = (id: string, created_at: string, status = 'new') => ({
    id, business_id: 'b', grant_id: `g${id}`, match_score: 80, match_reasoning: '', status, created_at,
    grants: { id: `g${id}`, title: `Pályázat ${id}`, deadline: null },
  });
  const matches = [
    match('1', '2026-11-21T09:00:00Z'),
    match('2', '2026-11-10T09:00:00Z'),
    match('3', '2026-11-20T09:00:00Z', 'stale'),
  ];
  const render = () => {
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false, loadError: null, profile: { company_name: 'Teszt Kft.', user_id: 'u1' }, matches, isPro: false,
      fetchData: jest.fn(), retryLoad: jest.fn(), handleNewSearch: jest.fn(), hasSearched: true, searching: false,
    });
    let root: any;
    act(() => {
      root = renderer.create(<HomeScreen navigation={{ navigate: jest.fn(), replace: jest.fn() } as any} />);
    });
    return root;
  };
  const header = (root: any) => {
    const list = root.root.findByType('FlatList');
    const children = [].concat(list.props.ListHeaderComponent.props.children);
    return children.find((c: any) => c && c.type === 'HomeStatusHeader') as any;
  };
  const isNewOf = (root: any, id: string) => {
    const list = root.root.findByType('FlatList');
    const item = matches.find((m) => m.id === id)!;
    if (list.props.data.includes(item)) return list.props.renderItem({ item, index: 0 }).props.isNew;
    return root.root.findAllByType('MatchCard').find((c: any) => c.props.item.id === id)?.props.isNew;
  };

  afterEach(() => {
    mockHomeStatus.previousVisit = null;
    mockHomeStatus.freshness = null;
  });

  it('marks only the current matches created after the previous visit, and counts them', () => {
    mockHomeStatus.previousVisit = '2026-11-15T00:00:00Z';
    mockHomeStatus.freshness = { updatedAt: '2026-11-21T09:07:00Z', openCount: 52 };
    const root = render();
    expect(isNewOf(root, '1')).toBe(true);
    expect(isNewOf(root, '2')).toBe(false);
    const h = header(root);
    expect(h.props.newCount).toBe(1);
    expect(h.props.freshness).toEqual({ updatedAt: '2026-11-21T09:07:00Z', openCount: 52 });
    expect(useHomeStatus).toHaveBeenCalledWith('u1', matches);
  });

  // Ellenőr #267 (2): the stale section is collapsed while fresh matches exist; a new stale match was counted in the
  // header but its label was not on screen. A stale match is never "Új" now, so the count equals the visible labels.
  it('the header count equals the "Új" labels on screen, the stale section collapsed and opened', () => {
    mockHomeStatus.previousVisit = '2026-11-15T00:00:00Z';
    const root = render();
    const list = root.root.findByType('FlatList');
    const visibleLabels = () => {
      const fresh = list.props.data.filter((item: any) => list.props.renderItem({ item, index: 0 }).props.isNew).length;
      let footer: any;
      act(() => { footer = renderer.create(root.root.findByType('FlatList').props.ListFooterComponent); });
      const staleCards = footer.root.findAllByType('MatchCard').filter((c: any) => c.props.isNew).length;
      return { fresh, staleCards, footer };
    };
    const collapsed = visibleLabels();
    expect(header(root).props.newCount).toBe(collapsed.fresh + collapsed.staleCards);
    act(() => { collapsed.footer.root.findByProps({ testID: 'home-stale-toggle' }).props.onPress(); });
    const opened = visibleLabels();
    const staleCard = opened.footer.root.findAllByType('MatchCard');
    expect(staleCard.map((c: any) => [c.props.item.id, c.props.isNew])).toEqual([['3', false]]);
    expect(header(root).props.newCount).toBe(opened.fresh + opened.staleCards);
  });

  it('a first visit marks nothing', () => {
    mockHomeStatus.previousVisit = null;
    const root = render();
    expect(isNewOf(root, '1')).toBe(false);
    expect(header(root).props.newCount).toBe(0);
  });

  it('while the previous visit is read nothing is marked', () => {
    mockHomeStatus.previousVisit = undefined;
    const root = render();
    expect(isNewOf(root, '1')).toBe(false);
    expect(header(root).props.newCount).toBe(0);
  });
});
