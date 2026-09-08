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
