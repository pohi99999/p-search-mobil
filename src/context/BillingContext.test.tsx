import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { BillingProvider, useBilling } from './BillingContext';
import { logger } from '../utils/logger';
import { isPurchasesError } from '../utils/error';

let mockEnv = {
  API_KEY_ANDROID: 'test-android-key',
  API_KEY_IOS: 'test-ios-key',
};

jest.mock('../config/env', () => ({
  get API_KEY_ANDROID() { return mockEnv.API_KEY_ANDROID; },
  get API_KEY_IOS() { return mockEnv.API_KEY_IOS; },
}));

jest.mock('../utils/error', () => {
  const original = jest.requireActual('../utils/error');
  return {
    ...original,
    isPurchasesError: jest.fn(),
  };
});

jest.mock('react-native-purchases', () => {
  return {
    configure: jest.fn(),
    getCustomerInfo: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
    getOfferings: jest.fn().mockResolvedValue({ current: null }),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    restorePurchases: jest.fn(),
    purchasePackage: jest.fn(),
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR',
    },
  };
});

jest.mock('../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('BillingContext', () => {
  const originalDev = global.__DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    mockEnv = {
      API_KEY_ANDROID: 'test-android-key',
      API_KEY_IOS: 'test-ios-key',
    };
    global.__DEV__ = false;
    (isPurchasesError as jest.Mock).mockReturnValue(false);
  });

  afterAll(() => {
    global.__DEV__ = originalDev;
  });

  const renderProvider = async () => {
    let contextValue: any;
    const TestComponent = () => {
      contextValue = useBilling();
      return null;
    };
    let root: any;
    await act(async () => {
      root = renderer.create(
        <BillingProvider>
          <TestComponent />
        </BillingProvider>
      );
    });
    return {
      getContext: () => contextValue,
      root
    };
  };

  describe('Initialization', () => {
    it('configures for iOS and fetches customer info and offerings', async () => {
      Platform.OS = 'ios';
      (Purchases.getOfferings as jest.Mock).mockResolvedValueOnce({
        current: { availablePackages: [{ identifier: 'pro_monthly' }] }
      });
      const { getContext } = await renderProvider();

      expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'test-ios-key' });
      expect(Purchases.getCustomerInfo).toHaveBeenCalled();
      expect(Purchases.getOfferings).toHaveBeenCalled();
      expect(getContext().packages.length).toBe(1);
      expect(getContext().isLoading).toBe(false);
    });

    it('configures for Android and fetches customer info', async () => {
      Platform.OS = 'android';
      const { getContext } = await renderProvider();

      expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'test-android-key' });
      expect(getContext().isLoading).toBe(false);
    });

    it('skips initialization on iOS if placeholder API key', async () => {
      Platform.OS = 'ios';
      mockEnv.API_KEY_IOS = 'placeholder-key';
      const { getContext } = await renderProvider();

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('RevenueCat iOS API key is missing or placeholder'));
      expect(Purchases.configure).not.toHaveBeenCalled();
      expect(getContext().isLoading).toBe(false);
    });

    it('skips initialization on Android if placeholder API key', async () => {
      Platform.OS = 'android';
      mockEnv.API_KEY_ANDROID = 'PLACEHOLDER_KEY';
      const { getContext } = await renderProvider();

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('RevenueCat Android API key is missing or placeholder'));
      expect(Purchases.configure).not.toHaveBeenCalled();
      expect(getContext().isLoading).toBe(false);
    });

    it('handles setup error gracefully', async () => {
      (Purchases.configure as jest.Mock).mockRejectedValueOnce(new Error('Setup failed'));
      const { getContext } = await renderProvider();

      expect(logger.warn).toHaveBeenCalledWith('Error setting up RevenueCat (prevented crash):', 'Setup failed');
      expect(getContext().isLoading).toBe(false);
    });
  });

  describe('Pro Status (__DEV__ vs Prod)', () => {
    it('sets isPro to true automatically in __DEV__', async () => {
      global.__DEV__ = true;
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({ entitlements: { active: {} } });
      const { getContext } = await renderProvider();

      expect(getContext().isPro).toBe(true);
    });

    it('sets isPro to true if customer has pro entitlement in prod', async () => {
      global.__DEV__ = false;
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({
        entitlements: { active: { pro: {} } }
      });
      const { getContext } = await renderProvider();

      expect(getContext().isPro).toBe(true);
    });

    it('sets isPro to false if customer lacks pro entitlement in prod', async () => {
      global.__DEV__ = false;
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValueOnce({
        entitlements: { active: {} }
      });
      const { getContext } = await renderProvider();

      expect(getContext().isPro).toBe(false);
    });

    it('updates pro status when customer info changes via listener', async () => {
      global.__DEV__ = false;
      let listener: any;
      (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
        listener = cb;
      });

      const { getContext } = await renderProvider();
      expect(getContext().isPro).toBe(false);

      // Simulate listener update
      await act(async () => {
        listener({ entitlements: { active: { pro: {} } } });
      });

      expect(getContext().isPro).toBe(true);
    });
  });

  describe('purchasePackage', () => {
    it('warns if RevenueCat is not configured', async () => {
      mockEnv.API_KEY_IOS = 'placeholder-key'; // skip init
      const { getContext } = await renderProvider();

      await act(async () => {
        await getContext().purchasePackage({ identifier: 'pro' });
      });

      expect(logger.warn).toHaveBeenCalledWith('Cannot purchase package: RevenueCat is not configured.');
      expect(Purchases.purchasePackage).not.toHaveBeenCalled();
    });

    it('purchases a package successfully and updates pro status', async () => {
      const { getContext } = await renderProvider();
      (Purchases.purchasePackage as jest.Mock).mockResolvedValueOnce({
        customerInfo: { entitlements: { active: { pro: {} } } }
      });

      await act(async () => {
        await getContext().purchasePackage({ identifier: 'pro' });
      });

      expect(Purchases.purchasePackage).toHaveBeenCalled();
      expect(getContext().isPro).toBe(true);
      expect(getContext().isLoading).toBe(false);
    });

    it('handles cancellation error without logging as error', async () => {
      const { getContext } = await renderProvider();
      const cancelError = new Error('Cancelled');
      (cancelError as any).code = 'PURCHASE_CANCELLED_ERROR';

      (Purchases.purchasePackage as jest.Mock).mockRejectedValueOnce(cancelError);
      (isPurchasesError as jest.Mock).mockReturnValue(true);

      await act(async () => {
        await getContext().purchasePackage({ identifier: 'pro' });
      });

      expect(logger.error).not.toHaveBeenCalled();
      expect(getContext().isLoading).toBe(false);
    });

    it('logs error for generic purchase errors', async () => {
      const { getContext } = await renderProvider();
      const error = new Error('Generic error');

      (Purchases.purchasePackage as jest.Mock).mockRejectedValueOnce(error);
      (isPurchasesError as jest.Mock).mockReturnValue(false);

      await act(async () => {
        await getContext().purchasePackage({ identifier: 'pro' });
      });

      expect(logger.error).toHaveBeenCalledWith('Error purchasing package:', 'Generic error');
      expect(getContext().isLoading).toBe(false);
    });
  });

  describe('restorePurchases', () => {
    it('warns if RevenueCat is not configured', async () => {
      mockEnv.API_KEY_IOS = 'placeholder-key'; // skip init
      const { getContext } = await renderProvider();

      await act(async () => {
        await getContext().restorePurchases();
      });

      expect(logger.warn).toHaveBeenCalledWith('Cannot restore purchases: RevenueCat is not configured.');
      expect(Purchases.restorePurchases).not.toHaveBeenCalled();
    });

    it('restores purchases successfully and updates pro status', async () => {
      const { getContext } = await renderProvider();
      (Purchases.restorePurchases as jest.Mock).mockResolvedValueOnce({
        entitlements: { active: { pro: {} } }
      });

      await act(async () => {
        await getContext().restorePurchases();
      });

      expect(Purchases.restorePurchases).toHaveBeenCalled();
      expect(getContext().isPro).toBe(true);
      expect(getContext().isLoading).toBe(false);
    });

    it('handles restorePurchases error correctly', async () => {
      const { getContext } = await renderProvider();
      const error = new Error('Restore failed');
      (Purchases.restorePurchases as jest.Mock).mockRejectedValueOnce(error);

      await act(async () => {
        await getContext().restorePurchases();
      });

      expect(Purchases.restorePurchases).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error restoring purchases:', 'Restore failed');
      expect(getContext().isLoading).toBe(false);
    });
  });
});
