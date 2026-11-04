export const INTERSTITIAL_AD_UNIT_ID = process.env.EXPO_PUBLIC_INTERSTITIAL_AD_UNIT_ID || 'ca-app-pub-3940256099942544/1033173712';
export const BANNER_AD_UNIT_ID = process.env.EXPO_PUBLIC_BANNER_AD_UNIT_ID || 'ca-app-pub-3940256099942544/6300978111';

export const API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID || '';
export const API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS || '';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

/**
 * The closed-test progress card on Home (TesterProgress). On by default while the closed test runs;
 * set EXPO_PUBLIC_SHOW_TESTER_PROGRESS=false (exactly "false") for the public store build.
 * A function, not a constant, so a test can switch it; Expo inlines the value at build time either way.
 */
export function showTesterProgress(): boolean {
  return process.env.EXPO_PUBLIC_SHOW_TESTER_PROGRESS !== 'false';
}
