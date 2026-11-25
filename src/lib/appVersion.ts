import * as Application from 'expo-application';
import { Platform } from 'react-native';

/**
 * "1.0.0 (8)" from the native app, so what the user reads is what Play installed.
 * On the web there is no native version: P-Search round 6 (Péter 18328, the web version is a product) shows
 * "web (<commit>)" instead of "ismeretlen". The commit comes from the Vercel build (vercel.json buildCommand passes
 * VERCEL_GIT_COMMIT_SHA as EXPO_PUBLIC_WEB_BUILD); a local export without it shows just "web".
 */
export function getAppVersionLabel(
  platform: string = Platform.OS,
  webBuild: string | undefined = process.env.EXPO_PUBLIC_WEB_BUILD,
): string {
  if (platform === 'web') {
    const commit = (webBuild ?? '').trim().slice(0, 7);
    return /^[0-9a-f]{7}$/i.test(commit) ? `web (${commit.toLowerCase()})` : 'web';
  }
  const version = Application.nativeApplicationVersion;
  const build = Application.nativeBuildVersion;
  if (!version && !build) return 'ismeretlen';
  return build ? `${version ?? '?'} (${build})` : String(version);
}
