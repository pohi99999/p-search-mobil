// The colour scheme (src/config/theme.ts): no role keeps the MD3 default purple, and the brand blue as text meets
// WCAG AA (4.5:1) on every surface a screen can put it on (round 6, P1-1 and P1-2).
import { MD3LightTheme } from 'react-native-paper';
import { appTheme, BRAND_BLUE } from '../../config/theme';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const c = appTheme.colors;
const SURFACES: Record<string, string> = {
  surface: c.surface,
  background: c.background,
  surfaceVariant: c.surfaceVariant,
  // The screens' own page grey (HomeScreen, SettingsScreen and others use #F4F4F4 or #F5F5F5).
  pageGrey: '#F4F4F4',
  ...Object.fromEntries(Object.entries(c.elevation).filter(([, v]) => v !== 'transparent')),
};

describe('app theme', () => {
  it('keeps no colour of the MD3 default palette in the roles a screen shows', () => {
    const roles = ['primary', 'primaryContainer', 'secondaryContainer', 'tertiary', 'tertiaryContainer', 'background', 'surface', 'surfaceVariant', 'onSurfaceVariant', 'outline', 'inversePrimary'] as const;
    for (const r of roles) expect([r, c[r]]).not.toEqual([r, (MD3LightTheme.colors as Record<string, unknown>)[r]]);
    for (const [k, v] of Object.entries(c.elevation)) if (v !== 'transparent') expect([k, v]).not.toEqual([k, (MD3LightTheme.colors.elevation as Record<string, string>)[k]]);
  });

  it('uses the brand blue as primary', () => {
    expect(c.primary).toBe(BRAND_BLUE);
  });

  it.each(Object.entries(SURFACES))('the brand blue as text is AA on %s', (_name, bg) => {
    expect(ratio(BRAND_BLUE, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the brand blue (buttons, FAB) is AA', () => {
    expect(ratio(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['onSurface', c.onSurface, c.surface],
    ['onSurfaceVariant', c.onSurfaceVariant, c.surfaceVariant],
    ['onPrimaryContainer', c.onPrimaryContainer, c.primaryContainer],
    ['onSecondaryContainer', c.onSecondaryContainer, c.secondaryContainer],
    ['onTertiaryContainer', c.onTertiaryContainer, c.tertiaryContainer],
    ['inverseOnSurface', c.inverseOnSurface, c.inverseSurface],
  ])('%s text on its container is AA', (_name, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('the field outline stands out from the field by 3:1 (WCAG 1.4.11)', () => {
    expect(ratio(c.outline, c.background)).toBeGreaterThanOrEqual(3);
  });
});
