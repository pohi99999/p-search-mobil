// Web-safe stub for `react-native-google-mobile-ads`.
//
// The native AdMob SDK ships components built with react-native's codegen
// (`codegenNativeComponent`), which cannot be resolved on the web bundler
// target. This stub mirrors the small subset of the package's public API
// actually used by the app (App.tsx, AdBanner.tsx, HomeScreen.tsx,
// useInterstitialAd.ts) so ads simply no-op on web instead of breaking the
// Metro web bundle. It is wired in via metro.config.js's resolver, which
// redirects `react-native-google-mobile-ads` imports to this file only when
// bundling for the "web" platform.

export const BannerAdSize = {
  BANNER: 'BANNER',
  ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER',
} as const;

export const TestIds = {
  BANNER: 'test-banner-web-stub',
  INTERSTITIAL: 'test-interstitial-web-stub',
} as const;

export const AdEventType = {
  LOADED: 'loaded',
  CLOSED: 'closed',
  ERROR: 'error',
} as const;

// Renders nothing on web — banners are a mobile-only monetization surface.
export const BannerAd = () => null;

class InterstitialAdWebStub {
  static createForAdRequest() {
    return new InterstitialAdWebStub();
  }

  addAdEventListener() {
    // No-op: never fires on web, so callers relying on LOADED never show it.
    return () => {};
  }

  load() {
    // No-op
  }

  show() {
    return Promise.resolve();
  }
}

export const InterstitialAd = InterstitialAdWebStub;

export default function mobileAds() {
  return {
    initialize: () => Promise.resolve([]),
  };
}
