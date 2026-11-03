import { StyleSheet } from 'react-native';

// Card [I]: WCAG 2.x contrast of two #RRGGBB colours, for tests that guard a text colour against its background.
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour a rendered node's (possibly nested) style resolves to. */
export function textColor(style: unknown): string {
  return String((StyleSheet.flatten(style as never) as { color?: string } | undefined)?.color ?? '');
}
