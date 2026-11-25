// Card [G5] (vc 18 E2E, Lumen 4800): a new account showed its "Következő keresés" in the past. The signup trigger
// (handle_new_user) stores next_scan_at = the signup moment, so the account is due at once, and the hourly scheduled
// scan (cron at minute 7) re-arms it within the hour. Until then the honest answer is "soon", not a past time.

/**
 * A schedule time as "2026. 11. 25. 11:24", in the device's time zone. The default toLocaleString('hu-HU') also printed
 * the seconds ("11:24:30"), which no search schedule is accurate to (round 6, Lumen P2-3).
 */
export function formatScheduleTime(value: string | Date): string {
  const at = value instanceof Date ? value : new Date(value);
  return at.toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** The "Következő keresés" line: nothing scheduled, due (now or in the past), or the scheduled local time. */
export function formatNextScan(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return 'Nincs ütemezve';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return 'Nincs ütemezve';
  if (at.getTime() <= now.getTime()) return 'Hamarosan, a következő órán belül';
  return formatScheduleTime(at);
}
