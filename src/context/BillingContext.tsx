import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesPackage, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { API_KEY_ANDROID, API_KEY_IOS } from '../config/env';
import { logger } from '../utils/logger';


interface BillingContextType {
  isPro: boolean;
  packages: PurchasesPackage[];
  purchasePackage: (pack: PurchasesPackage) => Promise<void>;
  restorePurchases: () => Promise<void>;
  isLoading: boolean;
}

const BillingContext = createContext<BillingContextType>({
  isPro: false,
  packages: [],
  purchasePackage: async () => {},
  restorePurchases: async () => {},
  isLoading: true,
});

export const useBilling = () => useContext(BillingContext);

export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPro, setIsPro] = useState(__DEV__ ? true : false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    const setup = async () => {
      try {
        const isPlaceholderAndroid = !API_KEY_ANDROID || API_KEY_ANDROID.includes('PLACEHOLDER');
        const isPlaceholderIOS = !API_KEY_IOS || API_KEY_IOS.includes('placeholder');

        if (Platform.OS === 'android' && isPlaceholderAndroid) {
          logger.warn('RevenueCat Android API key is missing or placeholder. Skipping RevenueCat initialization.');
          setIsLoading(false);
          return;
        }
        if (Platform.OS === 'ios' && isPlaceholderIOS) {
          logger.warn('RevenueCat iOS API key is missing or placeholder. Skipping RevenueCat initialization.');
          setIsLoading(false);
          return;
        }

        if (Platform.OS === 'android') {
          await Purchases.configure({ apiKey: API_KEY_ANDROID });
          setConfigured(true);
        } else if (Platform.OS === 'ios') {
          await Purchases.configure({ apiKey: API_KEY_IOS });
          setConfigured(true);
        }

        const customerInfo = await Purchases.getCustomerInfo();
        checkProStatus(customerInfo);

        const offerings = await Purchases.getOfferings();
        if (offerings.current && offerings.current.availablePackages.length !== 0) {
          setPackages(offerings.current.availablePackages);
        }
      } catch (e) {
        logger.warn('Error setting up RevenueCat (prevented crash):', e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    };

    setup();
  }, []);

  useEffect(() => {
    if (!configured) return;

    // Listen for customer info updates
    const customerInfoUpdateListener = (customerInfo: CustomerInfo) => {
      checkProStatus(customerInfo);
    };
    
    Purchases.addCustomerInfoUpdateListener(customerInfoUpdateListener);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(customerInfoUpdateListener);
    };
  }, [configured]);

  const checkProStatus = (customerInfo: CustomerInfo) => {
    if (__DEV__) {
      setIsPro(true);
      return;
    }
    // Check if the user has an active entitlement called 'pro'
    if (typeof customerInfo.entitlements.active['pro'] !== 'undefined') {
      setIsPro(true);
    } else {
      setIsPro(false);
    }
  };

  const purchasePackage = async (pack: PurchasesPackage) => {
    if (!configured) {
      logger.warn('Cannot purchase package: RevenueCat is not configured.');
      return;
    }
    try {
      setIsLoading(true);
      const { customerInfo } = await Purchases.purchasePackage(pack);
      checkProStatus(customerInfo);
    } catch (e: unknown) {
      const isCancelled = typeof e === 'object' && e !== null && ((e as any).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || (e as any).userCancelled);
      if (!isCancelled) {
        logger.error('Error purchasing package:', e instanceof Error ? e.message : String(e));
        // Here you might want to show an alert to the user
      }
    } finally {
      setIsLoading(false);
    }
  };

  const restorePurchases = async () => {
    if (!configured) {
      logger.warn('Cannot restore purchases: RevenueCat is not configured.');
      return;
    }
    try {
      setIsLoading(true);
      const customerInfo = await Purchases.restorePurchases();
      checkProStatus(customerInfo);
    } catch (e) {
      logger.error('Error restoring purchases:', e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <BillingContext.Provider
      value={{
        isPro,
        packages,
        purchasePackage,
        restorePurchases,
        isLoading,
      }}
    >
      {children}
    </BillingContext.Provider>
  );
};
