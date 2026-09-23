import * as Application from 'expo-application';

/** "1.0.0 (8)" from the native app, so what the user reads is what Play installed. */
export function getAppVersionLabel(): string {
  const version = Application.nativeApplicationVersion;
  const build = Application.nativeBuildVersion;
  if (!version && !build) return 'ismeretlen';
  return build ? `${version ?? '?'} (${build})` : String(version);
}
