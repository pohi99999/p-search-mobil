import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

// API Keys - Should be replaced with actual keys via environment variables or Constants
const API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID || 'goog_placeholder_key';
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
  const [isPro, setIsPro] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const setup = async () => {
      try {
        if (Platform.OS === 'android') {
          await Purchases.configure({ apiKey: API_KEY_ANDROID });
        } else if (Platform.OS === 'ios') {
          await Purchases.configure({ apiKey: API_KEY_IOS });
        }

        const customerInfo = await Purchases.getCustomerInfo();
        checkProStatus(customerInfo);

        const offerings = await Purchases.getOfferings();
        if (offerings.current && offerings.current.availablePackages.length !== 0) {
          setPackages(offerings.current.availablePackages);
        }
      } catch (e) {
        console.error('Error setting up RevenueCat:', e);
      } finally {
        setIsLoading(false);
      }
    };

    setup();

    // Listen for customer info updates
    const customerInfoUpdateListener = (customerInfo: CustomerInfo) => {
      checkProStatus(customerInfo);
    };
    
    Purchases.addCustomerInfoUpdateListener(customerInfoUpdateListener);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(customerInfoUpdateListener);
    };
  }, []);

  const checkProStatus = (customerInfo: CustomerInfo) => {
    // Check if the user has an active entitlement called 'pro'
    if (typeof customerInfo.entitlements.active['pro'] !== 'undefined') {
      setIsPro(true);
    } else {
      setIsPro(false);
    }
  };

  const purchasePackage = async (pack: PurchasesPackage) => {
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
