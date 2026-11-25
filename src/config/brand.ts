// The one brand blue for text and fills (round 6, 2026-11-25). Computed (WCAG), not remembered: 5.75:1 on white, and at
// least 4.84:1 on every surface text sits on: the page greys (5.22 to 5.27), the elevation levels (4.97 to 5.49) and
// surfaceVariant (4.84). NOT on primaryContainer (#D6E4FA): 4.47:1, under AA. No screen or component uses that
// surface, and src/lib/__tests__/theme.test.ts keeps it that way.
// Its own module, without react-native-paper, so components can import it where tests mock paper.
export const BRAND_BLUE = '#1565C0';
