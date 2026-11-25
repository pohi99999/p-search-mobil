import { formatNextScan, formatScheduleTime } from '../scheduleLabel';

// Card [G5]: the signup moment stored as next_scan_at is shown as "soon", a real future time as the time itself.
describe('formatNextScan', () => {
  const now = new Date('2026-10-25T10:00:00Z');

  it('a time in the past (the signup moment of a new account) reads as soon, not as a past date', () => {
    expect(formatNextScan('2026-10-25T09:12:00Z', now)).toBe('Hamarosan, a következő órán belül');
    expect(formatNextScan('2026-10-25T10:00:00Z', now)).toBe('Hamarosan, a következő órán belül');
  });

  it('a future time is shown as the local time', () => {
    const future = '2026-11-01T10:00:00Z';
    expect(formatNextScan(future, now)).toBe(formatScheduleTime(future));
  });

  // Round 6 (Lumen P2-3): the schedule is not accurate to the second; "11:24:30" read as if it were.
  it('a schedule time has no seconds: "2026. 11. 01. 11:00"', () => {
    const local = new Date(2026, 10, 1, 11, 0, 30);
    expect(formatScheduleTime(local)).toBe('2026. 11. 01. 11:00');
    expect(formatScheduleTime(local.toISOString())).toBe('2026. 11. 01. 11:00');
    expect(formatScheduleTime(local)).not.toMatch(/:\d\d:\d\d/);
    expect(formatNextScan(new Date(2026, 10, 1, 11, 0, 30).toISOString(), new Date(2026, 9, 1))).toBe('2026. 11. 01. 11:00');
  });

  it('nothing scheduled (manual) or unreadable', () => {
    expect(formatNextScan(null, now)).toBe('Nincs ütemezve');
    expect(formatNextScan(undefined, now)).toBe('Nincs ütemezve');
    expect(formatNextScan('nem dátum', now)).toBe('Nincs ütemezve');
  });
});
