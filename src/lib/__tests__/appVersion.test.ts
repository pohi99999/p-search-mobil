import { getAppVersionLabel } from '../appVersion';

jest.mock('expo-application', () => ({ nativeApplicationVersion: null, nativeBuildVersion: null }));

describe('getAppVersionLabel', () => {
  it('falls back to "ismeretlen" when the native module has nothing', () => {
    expect(getAppVersionLabel('android', undefined)).toBe('ismeretlen');
  });

  // P-Search round 6 (Péter 18328): the web version is a product; "ismeretlen" told support nothing.
  it('web with the Vercel commit: "web (<7 hex>)"', () => {
    expect(getAppVersionLabel('web', '8AC5468D2F1E0B9C7A6D5E4F3A2B1C0D9E8F7A6B')).toBe('web (8ac5468)');
  });

  it('web without a usable commit (local export, or a value that is not a commit): just "web"', () => {
    for (const v of [undefined, '', '   ', 'main', 'abc12']) {
      expect(getAppVersionLabel('web', v)).toBe('web');
    }
  });

  it('native ignores the web build value', () => {
    expect(getAppVersionLabel('ios', '8ac5468d2f')).toBe('ismeretlen');
  });
});
