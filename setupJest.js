import 'react-native';
import '@testing-library/jest-native/extend-expect';

jest.mock('@expo/vector-icons', () => {
  return {
    MaterialCommunityIcons: 'MaterialCommunityIcons',
  };
});
