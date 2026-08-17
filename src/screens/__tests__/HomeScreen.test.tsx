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

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: jest.fn().mockImplementation(({ children }) => children),
    SafeAreaConsumer: jest.fn().mockImplementation(({ children }) => children(inset)),
    useSafeAreaInsets: jest.fn().mockReturnValue(inset),
  };
});

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

  it('inserts an inline ad when not pro and has multiple matches', () => {
    const mockMatches = [
      { id: '1', title: 'Match 1', grants: {} },
      { id: '2', title: 'Match 2', grants: {} },
    ];
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      profile: { company_name: 'Test Company' },
      matches: mockMatches,
      isPro: false,
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch: jest.fn(),
    });

    const root = renderScreen();
    const flatList = root.root.findByType('FlatList');
    const data = flatList.props.data;

    expect(data.length).toBe(3); // 2 matches + 1 ad
    expect(data[1].type).toBe('ad');

    // Verify renderItem renders the ad correctly
    const renderItemResult = flatList.props.renderItem({ item: data[1] });
    expect(renderItemResult.type).toBe('View'); // Wrapping view
  });

  it('does not insert an inline ad when pro', () => {
    const mockMatches = [
      { id: '1', title: 'Match 1', grants: {} },
      { id: '2', title: 'Match 2', grants: {} },
    ];
    (useHomeData as jest.Mock).mockReturnValue({
      loading: false,
      profile: { company_name: 'Test Company' },
      matches: mockMatches,
      isPro: true, // User is PRO
      fetchData: jest.fn(),
      signOut: jest.fn(),
      handleNewSearch: jest.fn(),
    });

    const root = renderScreen();
    const flatList = root.root.findByType('FlatList');
    const data = flatList.props.data;

    expect(data.length).toBe(2); // Only matches, no ad
    expect(data.some((item: any) => item.type === 'ad')).toBeFalsy();
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
});
