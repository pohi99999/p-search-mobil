import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AdBanner } from '../AdBanner';
import * as BillingContext from '../../context/BillingContext';
import { BannerAd } from 'react-native-google-mobile-ads';
import { logger } from '../../utils/logger';

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
});
