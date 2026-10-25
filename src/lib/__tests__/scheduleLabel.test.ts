import { formatNextScan } from '../scheduleLabel';

// Card [G5]: the signup moment stored as next_scan_at is shown as "soon", a real future time as the time itself.
describe('formatNextScan', () => {
  const now = new Date('2026-10-25T10:00:00Z');

  it('a time in the past (the signup moment of a new account) reads as soon, not as a past date', () => {
    expect(formatNextScan('2026-10-25T09:12:00Z', now)).toBe('Hamarosan, a következő órán belül');
    expect(formatNextScan('2026-10-25T10:00:00Z', now)).toBe('Hamarosan, a következő órán belül');
  });

  it('a future time is shown as the local time', () => {
    const future = '2026-11-01T10:00:00Z';
    expect(formatNextScan(future, now)).toBe(new Date(future).toLocaleString('hu-HU'));
  });

  it('nothing scheduled (manual) or unreadable', () => {
    expect(formatNextScan(null, now)).toBe('Nincs ütemezve');
    expect(formatNextScan(undefined, now)).toBe('Nincs ütemezve');
    expect(formatNextScan('nem dátum', now)).toBe('Nincs ütemezve');
  });
});
