// The colour scheme (src/config/theme.ts): no role keeps the MD3 default purple, and the brand blue as text meets
// WCAG AA (4.5:1) on every surface a screen can put it on (round 6, P1-1 and P1-2).
import fs from 'fs';
import path from 'path';
import { MD3LightTheme } from 'react-native-paper';
import { appTheme, BRAND_BLUE } from '../../config/theme';

/**
 * A colour as "r,g,b,a", whatever its form: "#RRGGBB", "rgb(r, g, b)" or "rgba(r, g, b, a)". MD3's own palette is
 * written as rgba(...), so comparing the strings let the default come back in hex form (Ellenőr 9241 remark 2).
 */
export function norm(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) return `${parseInt(hex[1].slice(0, 2), 16)},${parseInt(hex[1].slice(2, 4), 16)},${parseInt(hex[1].slice(4, 6), 16)},1`;
  const fn = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color.trim());
  if (fn) return `${fn[1]},${fn[2]},${fn[3]},${fn[4] ?? '1'}`;
  return color.trim().toLowerCase();
}

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
    for (const r of roles) expect([r, norm(c[r])]).not.toEqual([r, norm((MD3LightTheme.colors as Record<string, string>)[r])]);
    for (const [k, v] of Object.entries(c.elevation)) if (v !== 'transparent') expect([k, norm(v)]).not.toEqual([k, norm((MD3LightTheme.colors.elevation as Record<string, string>)[k])]);
  });

  it('norm reads the same colour in every form (so a default put back in hex form is caught)', () => {
    expect(norm('#FFFBFE')).toBe(norm('rgba(255, 251, 254, 1)'));
    expect(norm('rgb(255,251,254)')).toBe(norm('#fffbfe'));
    expect(norm(MD3LightTheme.colors.background)).toBe(norm('#FFFBFE'));
    expect(norm('#FFFBFE')).not.toBe(norm('#FFFFFF'));
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

  // Round 6 follow-up (Ellenőr 9241 remark 1): the wiring and the hard-coded blues were not guarded; putting the
  // MD3 theme back in App.tsx, or the old blue back in a screen, left every test green. These read the source, so
  // they are a guard against that regression, not a render of the app: App.tsx needs its native modules, and the
  // behavioural measure stays the browser sweep of the production web build.
  describe('the wiring and the sources', () => {
    const root = path.join(__dirname, '..', '..');
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const sources: { file: string; code: string }[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'test-utils') walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue;
        sources.push({ file: path.relative(root, p).split(path.sep).join('/'), code: stripComments(fs.readFileSync(p, 'utf8')) });
      }
    };
    walk(root);

    it('App.tsx gives the Paper provider the app theme, not the MD3 default', () => {
      const app = stripComments(fs.readFileSync(path.join(root, '..', 'App.tsx'), 'utf8'));
      expect(app).toMatch(/import \{ appTheme \} from '\.\/src\/config\/theme';/);
      expect(app).toMatch(/const theme = appTheme;/);
      expect(app).toMatch(/<PaperProvider theme=\{theme\}>/);
      expect(app).not.toMatch(/MD3LightTheme/);
    });

    // Kenshin's files (9195): he converts them with BRAND_BLUE in his own PRs. The list can only shrink; a file that
    // is not on it must not bring the old blue back.
    const STILL_TO_CONVERT = ['screens/SettingsScreen.tsx', 'screens/DocumentUploadScreen.tsx', 'screens/ActionPlanScreen.tsx'];
    it('the old blue #1976D2 is not hard-coded outside the files still to be converted', () => {
      const offenders = sources.filter((s) => /#1976D2/i.test(s.code) && !STILL_TO_CONVERT.includes(s.file)).map((s) => s.file);
      expect(offenders).toEqual([]);
    });

    it('no screen or component uses primaryContainer: the brand blue as text is 4.47:1 on it, under AA', () => {
      const users = sources.filter((s) => /primaryContainer/.test(s.code) && s.file !== 'config/theme.ts').map((s) => s.file);
      expect(users).toEqual([]);
    });
  });
});
