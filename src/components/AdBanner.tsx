import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Surface } from 'react-native-paper';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useBilling } from '../context/BillingContext';

// Google Play hivatalos teszt Banner ID
const BANNER_AD_UNIT_ID = 'ca-app-pub-3940256099942544/6300978111';

export const AdBanner: React.FC = () => {
  const { isPro } = useBilling();
  const [adFailed, setAdFailed] = useState(false);

  // Ha Pro előfizetőnk van, vagy nem sikerült betölteni a hirdetést, nem jelenítünk meg semmit
  if (isPro || adFailed) {
    return null;
  }

  return (
    <Surface style={styles.container} elevation={1}>
      <View style={styles.adContainer}>
        <BannerAd
          unitId={BANNER_AD_UNIT_ID}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdFailedToLoad={(error) => {
            console.warn('AdBanner failed to load ad:', error);
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
