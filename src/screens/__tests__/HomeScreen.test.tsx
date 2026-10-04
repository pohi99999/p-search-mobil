import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { HomeScreen } from '../HomeScreen';
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
jest.mock('../../components/MatchCard', () => ({
  MatchCard: 'MatchCard',
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
    const fab = root.root.findByType('FAB');
    act(() => {
      fab.props.onPress();
    });

    expect(mockHandleNewSearch).toHaveBeenCalled();
  });

  it('calls signOut on logout button press', () => {
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
    const buttons = root.root.findAllByType('Button');
    const logoutButton = buttons.find((b: any) => b.props.children === 'Kijelentkezés');

    act(() => {
      logoutButton?.props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalled();
  });

  // Owner decision 2026-10-04 (Telegram 6053): no test ad unit may ship from the Home screen.
  it('the Home screen source uses no AdMob test unit', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'HomeScreen.tsx'), 'utf8');
    expect(src).not.toMatch(/TestIds/);
  });
});
