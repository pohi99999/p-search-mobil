import { splitBold } from '../inlineBold';

// #238 live chat test (Marveen 4864): the bubble showed "**2026. 12. 02.**" with the asterisks.
describe('splitBold', () => {
  it('turns "**…**" pairs into bold segments', () => {
    expect(splitBold('A határidő **2026. 12. 02.**, ellenőrizd.')).toEqual([
      { text: 'A határidő ', bold: false },
      { text: '2026. 12. 02.', bold: true },
      { text: ', ellenőrizd.', bold: false },
    ]);
  });

  it('handles several pairs and a bold start', () => {
    expect(splitBold('**Első** és **második**')).toEqual([
      { text: 'Első', bold: true },
      { text: ' és ', bold: false },
      { text: 'második', bold: true },
    ]);
  });

  it('drops an unpaired "**" instead of showing it', () => {
    expect(splitBold('Összeg: **20 000 000 Ft')).toEqual([{ text: 'Összeg: 20 000 000 Ft', bold: false }]);
    expect(splitBold('**a** és **b')).toEqual([
      { text: 'a', bold: true },
      { text: ' és b', bold: false },
    ]);
  });

  it('leaves text without markers alone and never yields an asterisk pair', () => {
    expect(splitBold('Sima szöveg.')).toEqual([{ text: 'Sima szöveg.', bold: false }]);
    expect(splitBold('')).toEqual([]);
    expect(splitBold('****')).toEqual([]);
    const joined = splitBold('x **y** z **w').map((s) => s.text).join('');
    expect(joined).not.toContain('**');
  });
});
