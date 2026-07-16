import { logger } from '../utils/logger';
import { useEffect, useRef, useState } from 'react';
import { InterstitialAd, AdEventType } from 'react-native-google-mobile-ads';
import { useBilling } from '../context/BillingContext';
import { INTERSTITIAL_AD_UNIT_ID } from '../config/env';

export const useInterstitialAd = () => {
  const { isPro } = useBilling();
  const [isLoaded, setIsLoaded] = useState(false);
  const adInstanceRef = useRef<InterstitialAd | null>(null);
  const onAdFinishedRef = useRef<(() => void) | null>(null);

  // Hirdetés létrehozása és betöltése
  const loadAd = () => {
    if (isPro) return;

    setIsLoaded(false);

    const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      setIsLoaded(true);
    });

    const unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      if (onAdFinishedRef.current) {
        onAdFinishedRef.current();
        onAdFinishedRef.current = null;
      }
      setIsLoaded(false);
      // Következő hirdetés előtöltése a háttérben
      loadAd();
    });

    // Ha hiba történik betöltéskor vagy megjelenítéskor, ne ragadjon be az app
    const unsubscribeError = interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
      logger.error('Interstitial ad encountered an error:', error);
      setIsLoaded(false);
      if (onAdFinishedRef.current) {
        onAdFinishedRef.current();
        onAdFinishedRef.current = null;
      }
    });

    interstitial.load();
    adInstanceRef.current = interstitial;
  };

  useEffect(() => {
    if (!isPro) {
      loadAd();
    }
    return () => {
      // Takarítás (Clean-up)
      adInstanceRef.current = null;
    };
  }, [isPro]);

  const showAdIfAvailable = (onAdFinished: () => void) => {
    // Ha Pro a felhasználó, nincs betöltve a hirdetés, vagy hiányzik az adInstance,
    // azonnal futtatjuk a callbacket, hogy ne akadjon el a felhasználói élmény.
    if (isPro || !isLoaded || !adInstanceRef.current) {
      onAdFinished();
    } else {
      onAdFinishedRef.current = onAdFinished;
      adInstanceRef.current.show().catch((error) => {
        logger.error('Failed to present interstitial ad:', error);
        // Hiba esetén is azonnal továbblépünk
        onAdFinished();
      });
    }
  };

  return {
    showAdIfAvailable,
    isLoaded,
  };
};
