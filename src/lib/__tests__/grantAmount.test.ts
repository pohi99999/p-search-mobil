import { formatGrantAmount } from '../grantAmount';

// The two cards from the owner's test (2026-10-15, Telegram 7827) and the honest cases around them.
describe('formatGrantAmount (card 378073ce)', () => {
  it('a placeholder minimum of 1 Ft is not printed as a lower bound', () => {
    expect(formatGrantAmount(1, 150_000_000)).toBe('legfeljebb 150 000 000 Ft');
  });
  it('a maximum that is the programme budget is labelled keretösszeg, not a per-project range', () => {
    expect(formatGrantAmount(1, 138_937_500_000)).toBe('keretösszeg 138 937 500 000 Ft');
    expect(formatGrantAmount(1, 10_000_000_001)).toBe('keretösszeg 10 000 000 001 Ft');
    expect(formatGrantAmount(1_000_000, 501_639_976_703)).toBe('legalább 1 000 000 Ft, keretösszeg 501 639 976 703 Ft');
  });
  it('the 10 billion Ft limit itself is still a per-company maximum (only above it is a budget)', () => {
    expect(formatGrantAmount(1, 10_000_000_000)).toBe('legfeljebb 10 000 000 000 Ft');
    expect(formatGrantAmount(5_000_000, 10_000_000_000)).toBe('5 000 000 Ft - 10 000 000 000 Ft');
  });
  it('a real range stays a range', () => {
    expect(formatGrantAmount(5_000_000, 150_000_000)).toBe('5 000 000 Ft - 150 000 000 Ft');
    expect(formatGrantAmount(3_000_000, 3_000_000)).toBe('3 000 000 Ft');
  });
  it('one-sided and empty data', () => {
    expect(formatGrantAmount(5_000_000, null)).toBe('legalább 5 000 000 Ft');
    expect(formatGrantAmount(null, 20_000_000)).toBe('legfeljebb 20 000 000 Ft');
    expect(formatGrantAmount(null, null)).toBeNull();
    expect(formatGrantAmount(1, null)).toBeNull();
    expect(formatGrantAmount(0, 0)).toBeNull();
  });
});
