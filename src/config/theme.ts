import { MD3LightTheme } from 'react-native-paper';
import { BRAND_BLUE } from './brand';

// The app's colour scheme (Lumen, round 6, 2026-11-25). Before this the theme set only `primary` and `secondary`,
// and every other MD3 role kept the default purple palette: lavender cards and dialogs (elevation levels), pinkish
// fields (background #FFFBFE), a purple spinner. And the blue #1976D2 as 14 px text was 3.83 to 4.26:1 on those
// tinted surfaces, under WCAG AA's 4.5:1 (round 6 list, P1-1 and P1-2).
//
// Now every role a screen can show is set from the brand blue (./brand) and neutral greys.

export { BRAND_BLUE };

export const appTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: BRAND_BLUE,
    onPrimary: '#FFFFFF',
    primaryContainer: '#D6E4FA',
    onPrimaryContainer: '#0B2C5A',
    secondary: '#424242',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#E3E8EF',
    onSecondaryContainer: '#1B1F24',
    tertiary: '#2E7D32',
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#DCEFDD',
    onTertiaryContainer: '#0E3B12',
    background: '#FFFFFF',
    onBackground: '#1B1C1F',
    surface: '#FFFFFF',
    onSurface: '#1B1C1F',
    surfaceVariant: '#E8ECF1',
    onSurfaceVariant: '#44484F',
    outline: '#73777F',
    outlineVariant: '#C3C7CE',
    inverseSurface: '#2F3134',
    inverseOnSurface: '#F1F2F5',
    inversePrimary: '#A8C8F5',
    elevation: {
      level0: 'transparent',
      level1: '#F8FAFC',
      level2: '#F3F6FA',
      level3: '#EFF3F8',
      level4: '#EDF1F7',
      level5: '#EAEFF5',
    },
  },
};
