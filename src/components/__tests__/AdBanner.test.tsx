import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AdBanner } from '../AdBanner';
import * as BillingContext from '../../context/BillingContext';
import { BannerAd } from 'react-native-google-mobile-ads';
import { logger } from '../../utils/logger';
import { Platform } from 'react-native';

// BillingContext imports src/lib/supabase, which loads the native expo-secure-store module; jest
// cannot load it ("Cannot read properties of undefined (reading 'EventEmitter')"), so the whole
// suite failed to run and kept CI red since 2026-09-12. Mock the client like the other suites do.
jest.mock('../../lib/supabase', () => ({ supabase: { auth: {}, from: jest.fn(), functions: { invoke: jest.fn() } } }));
// Edge-to-edge insets (card bc8e4135): tests set mockInsets.bottom to measure the layout.
const mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => mockInsets,
}));
jest.mock('react-native-google-mobile-ads', () => ({
  BannerAd: jest.fn(() => null),
  BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' }
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }
}));

describe('AdBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    mockInsets.bottom = 0;
  });

  it('renders nothing on non-android (web/iOS)', () => {
    jest.spyOn(BillingContext, 'useBilling').mockReturnValue({ isPro: false } as never);
    Platform.OS = 'web';
    const tree = renderer.create(<AdBanner />);
    expect(tree.toJSON()).toBeNull();
    expect(BannerAd).not.toHaveBeenCalled();
    Platform.OS = 'android';
  });

  it('renders BannerAd when isPro is false and ad has not failed', () => {
    jest.spyOn(BillingContext, 'useBilling').mockReturnValue({
      isPro: false,
      packages: [],
      purchasePackage: jest.fn(),
      restorePurchases: jest.fn(),
      isLoading: false,
    });

    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<AdBanner />);
    });

    const bannerAdInstances = root!.root.findAllByType(BannerAd);
    expect(bannerAdInstances.length).toBe(1);
  });

  it('does not render anything when isPro is true', () => {
    jest.spyOn(BillingContext, 'useBilling').mockReturnValue({
      isPro: true,
      packages: [],
      purchasePackage: jest.fn(),
      restorePurchases: jest.fn(),
      isLoading: false,
    });

    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<AdBanner />);
    });

    expect(root!.toJSON()).toBeNull();
  });

  it('hides the ad when onAdFailedToLoad is called', () => {
    jest.spyOn(BillingContext, 'useBilling').mockReturnValue({
      isPro: false,
      packages: [],
      purchasePackage: jest.fn(),
      restorePurchases: jest.fn(),
      isLoading: false,
    });

    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<AdBanner />);
    });

    const bannerAd = root!.root.findByType(BannerAd);

    act(() => {
      bannerAd.props.onAdFailedToLoad(new Error('test error'));
    });

    expect(root!.toJSON()).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('AdBanner failed to load ad:', expect.any(Error));
  });

  // Card bc8e4135, owner test 2026-10-04: on edge-to-edge Android the navigation bar was drawn
  // over the banner. The banner now pads itself by the bottom inset and reports its height.
  it('pads the banner by the navigation-bar inset', () => {
    jest.spyOn(BillingContext, 'useBilling').mockReturnValue({ isPro: false } as never);
    mockInsets.bottom = 48;
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<AdBanner />);
    });
    const surface = component!.root.find((n) => n.props.testID === 'ad-banner');
    const style = [surface.props.style].flat(2).reduce((acc: Record<string, unknown>, x: Record<string, unknown>) => ({ ...acc, ...(x || {}) }), {});
    expect(style.paddingBottom).toBe(48);
  });

  it('reports its measured height, and 0 when it is not shown', () => {
    const onHeightChange = jest.fn();
    jest.spyOn(BillingContext, 'useBilling').mockReturnValue({ isPro: false } as never);
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<AdBanner onHeightChange={onHeightChange} />);
    });
    const surface = component!.root.find((n) => n.props.testID === 'ad-banner');
    act(() => {
      surface.props.onLayout({ nativeEvent: { layout: { height: 98 } } });
    });
    expect(onHeightChange).toHaveBeenLastCalledWith(98);

    jest.spyOn(BillingContext, 'useBilling').mockReturnValue({ isPro: true } as never);
    act(() => {
      component.update(<AdBanner onHeightChange={onHeightChange} />);
    });
    expect(onHeightChange).toHaveBeenLastCalledWith(0);
  });
});
