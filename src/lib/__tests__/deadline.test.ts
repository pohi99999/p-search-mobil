import { formatDeadline, deadlineDetailText, deadlineDay, DEADLINE_SOON_DAYS } from '../deadline';

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
    // Yesterday 23:00 is past.
    expect(formatDeadline(at(2026, 10, 24, 23), NOW).tone).toBe('expired');
  });

  it('the deadline day itself is still open, even past the stored hour (same rule as isOpenGrant, [C])', () => {
    const afternoon = new Date(2026, 9, 25, 15, 0, 0);
    expect(formatDeadline(at(2026, 10, 25, 8), NOW).tone).toBe('soon');
    // Midnight at the END of today (tomorrow 00:00) is today's deadline: "ma jár le" at 15:00.
    expect(formatDeadline(new Date(2026, 9, 26, 0, 0, 0).toISOString(), afternoon)).toMatchObject({ tone: 'soon', label: 'Beadás: 2026. 10. 25. (ma jár le)', daysLeft: 0 });
  });

  // Marveen 4801: the source's 2026-12-01T23:00Z (= 2026-12-02 00:00 in Budapest) closes at the end of 12-01;
  // the card used to show "2026. 12. 02.".
  it('a deadline at exactly local midnight belongs to the day before', () => {
    expect(formatDeadline(new Date(2026, 11, 2, 0, 0, 0).toISOString(), NOW).label).toBe('Beadás: 2026. 12. 01. (még 37 nap)');
    expect(deadlineDetailText(formatDeadline(new Date(2026, 11, 2, 0, 0, 0).toISOString(), NOW))).toBe('2026. 12. 01.');
    // Today 00:00 is yesterday's deadline: expired, dated yesterday.
    expect(formatDeadline(new Date(2026, 9, 25, 0, 0, 0).toISOString(), NOW)).toEqual({ tone: 'expired', label: 'Lejárt: 2026. 10. 24.', date: '2026. 10. 24.' });
    // One minute past midnight is that day's deadline, not the day before.
    expect(formatDeadline(new Date(2026, 11, 2, 0, 1, 0).toISOString(), NOW).label).toBe('Beadás: 2026. 12. 02. (még 38 nap)');
  });

  it('deadlineDay moves only an exact midnight', () => {
    expect(deadlineDay(new Date(2026, 11, 2, 0, 0, 0)).getDate()).toBe(1);
    expect(deadlineDay(new Date(2026, 11, 2, 0, 0, 1)).getDate()).toBe(2);
    expect(deadlineDay(new Date(2026, 11, 1, 23, 59, 59)).getDate()).toBe(1);
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
