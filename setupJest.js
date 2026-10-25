import 'react-native';
import '@testing-library/jest-native/extend-expect';

jest.mock('@expo/vector-icons', () => {
  return {
    MaterialCommunityIcons: 'MaterialCommunityIcons',
  };
});

// AsyncStorage-nak nincs natív modulja a Jest-környezetben; a csomag saját
// mockja kell hozzá. Az egyes suite-ok ezt felülírhatják saját jest.mock-kal.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Card [G]: src/services/events.ts reads the app version; the native module is absent under jest. A test that needs
// a value mocks expo-application itself (that overrides this one).
jest.mock('expo-application', () => ({ nativeApplicationVersion: null, nativeBuildVersion: null }));
