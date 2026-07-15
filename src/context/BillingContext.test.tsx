import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { BillingProvider, useBilling } from './BillingContext';
import { logger } from '../utils/logger';

// Mock react-native-purchases
jest.mock('react-native-purchases', () => {
  return {
    configure: jest.fn(),
    getCustomerInfo: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
    getOfferings: jest.fn().mockResolvedValue({ current: null }),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    restorePurchases: jest.fn(),
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR',
    },
  };
});

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock env vars
jest.mock('../config/env', () => ({
  API_KEY_ANDROID: 'test-android-key',
  API_KEY_IOS: 'test-ios-key',
}));

describe('BillingContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
  });

  it('handles restorePurchases error correctly', async () => {
    const error = new Error('Restore failed');
    (Purchases.restorePurchases as jest.Mock).mockRejectedValue(error);

    let contextValue: any;

    const TestComponent = () => {
      contextValue = useBilling();
      return null;
    };

    let root: any;

    // Mount and wait for initial setup
    await act(async () => {
      root = renderer.create(
        <BillingProvider>
          <TestComponent />
        </BillingProvider>
      );
    });

    // Make sure configure was called so configured is true
    expect(Purchases.configure).toHaveBeenCalled();

    // Call restorePurchases which should reject
    await act(async () => {
      await contextValue.restorePurchases();
    });

    expect(Purchases.restorePurchases).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Error restoring purchases:', 'Restore failed');
    // After finally block, isLoading should be false
    expect(contextValue.isLoading).toBe(false);
  });
});
