import { formatDeadline, deadlineDetailText, DEADLINE_SOON_DAYS } from '../deadline';

// Fixed "now" in local time, so the day counts do not depend on when the suite runs.
const NOW = new Date(2026, 9, 25, 10, 0, 0); // 2026-10-25 10:00 local
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).toISOString();

describe('formatDeadline (card [A])', () => {
  it('a missing or unreadable deadline says so instead of hiding the line', () => {
    expect(formatDeadline(null, NOW)).toEqual({ tone: 'unknown', label: 'Beadási határidő: nincs megadva' });
    expect(formatDeadline(undefined, NOW).tone).toBe('unknown');
    expect(formatDeadline('not a date', NOW).tone).toBe('unknown');
  });

  it('a past deadline is expired, with its date', () => {
    expect(formatDeadline(at(2026, 10, 1), NOW)).toEqual({ tone: 'expired', label: 'Lejárt: 2026. 10. 01.', date: '2026. 10. 01.' });
    // Earlier today is already past.
    expect(formatDeadline(at(2026, 10, 25, 8), NOW).tone).toBe('expired');
  });

  it('later today is not expired yet', () => {
    expect(formatDeadline(at(2026, 10, 25, 18), NOW)).toMatchObject({ tone: 'soon', label: 'Beadás: 2026. 10. 25. (ma jár le)', daysLeft: 0 });
  });

  it(`fewer than ${DEADLINE_SOON_DAYS} days left is "soon", from ${DEADLINE_SOON_DAYS} on it is normal`, () => {
    expect(formatDeadline(at(2026, 11, 2), NOW)).toMatchObject({ tone: 'soon', label: 'Beadás: 2026. 11. 02. (még 8 nap)' });
    expect(formatDeadline(at(2026, 11, 7), NOW).tone).toBe('soon'); // 13 days
    expect(formatDeadline(at(2026, 11, 8), NOW)).toMatchObject({ tone: 'normal', label: 'Beadás: 2026. 11. 08. (még 14 nap)' });
  });

  it('counts calendar days, not 24-hour blocks', () => {
    // Tomorrow 01:00 is 15 hours away but one calendar day.
    expect(formatDeadline(at(2026, 10, 26, 1), NOW).label).toBe('Beadás: 2026. 10. 26. (még 1 nap)');
  });
});

describe('deadlineDetailText (card [B])', () => {
  it('words each state for the detail view', () => {
    expect(deadlineDetailText(formatDeadline(null, NOW))).toBe('A kiírás nem ad meg határidőt.');
    expect(deadlineDetailText(formatDeadline(at(2026, 10, 1), NOW))).toBe('Lejárt: 2026. 10. 01.');
    expect(deadlineDetailText(formatDeadline(at(2026, 10, 25, 18), NOW))).toBe('Ma jár le: 2026. 10. 25.');
    expect(deadlineDetailText(formatDeadline(at(2026, 11, 2), NOW))).toBe('Még 8 nap: 2026. 11. 02.');
    expect(deadlineDetailText(formatDeadline(at(2026, 12, 15), NOW))).toBe('2026. 12. 15.');
  });
});
