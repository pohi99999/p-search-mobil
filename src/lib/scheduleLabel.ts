// Card [G5] (vc 18 E2E, Lumen 4800): a new account showed its "Következő keresés" in the past. The signup trigger
// (handle_new_user) stores next_scan_at = the signup moment, so the account is due at once, and the hourly scheduled
// scan (cron at minute 7) re-arms it within the hour. Until then the honest answer is "soon", not a past time.

/** The "Következő keresés" line: nothing scheduled, due (now or in the past), or the scheduled local time. */
export function formatNextScan(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return 'Nincs ütemezve';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return 'Nincs ütemezve';
  if (at.getTime() <= now.getTime()) return 'Hamarosan, a következő órán belül';
  return at.toLocaleString('hu-HU');
}
