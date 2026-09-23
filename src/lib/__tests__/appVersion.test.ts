jest.mock('expo-application', () => ({ nativeApplicationVersion: null, nativeBuildVersion: null }));
import { getAppVersionLabel } from '../appVersion';

describe('getAppVersionLabel', () => {
  it('falls back to "ismeretlen" when the native module has nothing', () => {
    expect(getAppVersionLabel()).toBe('ismeretlen');
  });
});
