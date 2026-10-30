import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesPackage, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { API_KEY_ANDROID, API_KEY_IOS } from '../config/env';
import { getErrorMessage, isPurchasesError } from '../utils/error';
import { logger } from '../utils/logger';
import { supabase } from '../lib/supabase';


/**
 * What a purchase came to (P-Search kör 2, Kenshin P1-2). The caller decides what to show and what to record:
 * until 2026-10-30 every outcome resolved the same way, so the paywall recorded purchase_done after a cancel,
 * a failure or with RevenueCat not configured.
 */
export type PurchaseResult = 'purchased' | 'cancelled' | 'failed' | 'unavailable';

/** A restore's outcome: whether the account has an active Pro entitlement now (Kenshin P1-3). Throws on failure. */
export interface RestoreResult {
  isPro: boolean;
}

interface BillingContextType {
  isPro: boolean;
  packages: PurchasesPackage[];
  purchasePackage: (pack: PurchasesPackage) => Promise<PurchaseResult>;
  restorePurchases: () => Promise<RestoreResult>;
  isLoading: boolean;
}

const BillingContext = createContext<BillingContextType>({
  isPro: false,
  packages: [],
  purchasePackage: async () => 'unavailable',
  restorePurchases: async () => { throw new Error('RevenueCat is not configured.'); },
  isLoading: true,
});

export const useBilling = () => useContext(BillingContext);

export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPro, setIsPro] = useState(__DEV__ ? true : false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [configured, setConfigured] = useState(false);

  /** Sets isPro from the customer info and returns it (an active entitlement called 'pro'; always true in __DEV__). */
  const checkProStatus = (customerInfo: CustomerInfo): boolean => {
    const pro = __DEV__ ? true : typeof customerInfo.entitlements.active['pro'] !== 'undefined';
    setIsPro(pro);
    return pro;
  };

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

        // Tie the RevenueCat identity to the Supabase user so the webhook's
        // app_user_id maps to profiles.id (Pro mirror). Anonymous until sign-in.
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) await Purchases.logIn(session.user.id);
        } catch (e) {
          logger.warn('RevenueCat logIn failed (continuing):', getErrorMessage(e));
        }

        const customerInfo = await Purchases.getCustomerInfo();
        checkProStatus(customerInfo);

        const offerings = await Purchases.getOfferings();
        if (offerings.current && offerings.current.availablePackages.length !== 0) {
          setPackages(offerings.current.availablePackages);
        }
      } catch (e) {
        logger.warn('Error setting up RevenueCat (prevented crash):', getErrorMessage(e));
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

  // Keep the RevenueCat identity in sync with sign-in/out so purchases are always
  // attributed to the right Supabase user (and the webhook can mirror the tier).
  useEffect(() => {
    if (!configured) return;
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        Purchases.logIn(session.user.id).catch((e) =>
          logger.warn('RevenueCat logIn on auth change failed:', getErrorMessage(e)));
      } else {
        Purchases.logOut().catch((e) =>
          logger.warn('RevenueCat logOut on sign-out failed:', getErrorMessage(e)));
      }
    });
    return () => { authSub.subscription.unsubscribe(); };
  }, [configured]);

  // The paywall shows the message for each outcome; this context only reports it (no Alert of its own, so a
  // failure is never announced twice).
  const purchasePackage = async (pack: PurchasesPackage): Promise<PurchaseResult> => {
    if (!configured) {
      logger.warn('Cannot purchase package: RevenueCat is not configured.');
      return 'unavailable';
    }
    try {
      setIsLoading(true);
      const { customerInfo } = await Purchases.purchasePackage(pack);
      checkProStatus(customerInfo);
      return 'purchased';
    } catch (e: unknown) {
      const isCancelled = isPurchasesError(e) && (e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || e.userCancelled);
      if (isCancelled) return 'cancelled';
      logger.error('Error purchasing package:', getErrorMessage(e));
      return 'failed';
    } finally {
      setIsLoading(false);
    }
  };

  const restorePurchases = async (): Promise<RestoreResult> => {
    if (!configured) {
      logger.warn('Cannot restore purchases: RevenueCat is not configured.');
      throw new Error('RevenueCat is not configured.');
    }
    try {
      setIsLoading(true);
      const customerInfo = await Purchases.restorePurchases();
      return { isPro: checkProStatus(customerInfo) };
    } catch (e) {
      logger.error('Error restoring purchases:', getErrorMessage(e));
      throw e;
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
