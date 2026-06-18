import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

// API Keys - Should be replaced with actual keys via environment variables or Constants
const API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID || 'REVENUECAT_GOOGLE_API_KEY_PLACEHOLDER';
const API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS || 'appl_placeholder_key';

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
        const isPlaceholderAndroid = API_KEY_ANDROID.includes('PLACEHOLDER') || API_KEY_ANDROID === '';
        const isPlaceholderIOS = API_KEY_IOS.includes('placeholder') || API_KEY_IOS === '';

        if (Platform.OS === 'android' && isPlaceholderAndroid) {
          console.warn('RevenueCat Android API key is missing or placeholder. Skipping RevenueCat initialization.');
          setIsLoading(false);
          return;
        }
        if (Platform.OS === 'ios' && isPlaceholderIOS) {
          console.warn('RevenueCat iOS API key is missing or placeholder. Skipping RevenueCat initialization.');
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
        console.warn('Error setting up RevenueCat (prevented crash):', e);
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
      console.warn('Cannot purchase package: RevenueCat is not configured.');
      return;
    }
    try {
      setIsLoading(true);
      const { customerInfo } = await Purchases.purchasePackage(pack);
      checkProStatus(customerInfo);
    } catch (e: any) {
      if (!e.userCancelled) {
        console.error('Error purchasing package:', e);
        // Here you might want to show an alert to the user
      }
    } finally {
      setIsLoading(false);
    }
  };

  const restorePurchases = async () => {
    if (!configured) {
      console.warn('Cannot restore purchases: RevenueCat is not configured.');
      return;
    }
    try {
      setIsLoading(true);
      const customerInfo = await Purchases.restorePurchases();
      checkProStatus(customerInfo);
    } catch (e) {
      console.error('Error restoring purchases:', e);
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
