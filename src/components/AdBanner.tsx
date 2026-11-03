import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { Surface } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useBilling } from '../context/BillingContext';
import { BANNER_AD_UNIT_ID } from '../config/env';
import { logger } from '../utils/logger';

type AdBannerProps = {
  /** Reports the banner's on-screen height (0 when it is not shown), so a screen can keep its
   *  floating controls above it instead of guessing a fixed offset. */
  onHeightChange?: (height: number) => void;
};

export const AdBanner: React.FC<AdBannerProps> = ({ onHeightChange }) => {
  const { isPro } = useBilling();
  const [adFailed, setAdFailed] = useState(false);
  const insets = useSafeAreaInsets();

  // Csak Androidon jelenítünk hirdetést; Pro előfizetőnek soha, és ha a betöltés
  // elhasalt, szintén nem. (Web: nincs hirdetés; iOS: nem build-cél.)
  const hidden = isPro || adFailed || Platform.OS !== 'android';
  useEffect(() => {
    if (hidden) onHeightChange?.(0);
  }, [hidden, onHeightChange]);

  if (hidden) {
    return null;
  }

  // Edge-to-edge (targetSdk 36): the screen extends under the Android navigation bar, so the
  // banner sits above the bar's inset; without it the bar's buttons were drawn over the ad
  // (vc 11, owner test 2026-10-04).
  return (
    <Surface
      style={[styles.container, { paddingBottom: insets.bottom }]}
      elevation={1}
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
      testID="ad-banner"
    >
      <View style={styles.adContainer}>
        <BannerAd
          unitId={BANNER_AD_UNIT_ID}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdFailedToLoad={(error) => {
            logger.warn('AdBanner failed to load ad:', error);
            setAdFailed(true);
          }}
        />
      </View>
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  adContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 50,
  },
});
