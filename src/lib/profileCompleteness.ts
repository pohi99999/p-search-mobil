import type { BusinessProfile } from '../types/database';

// Card 431a496e (common test 2026-10-07): Péter's profile had only the company name, and the generated
// PDF said "a cég TEÁOR kódja nincs megadva, feltételezzük...". Before a plan or a PDF is generated, the
// app asks for these fields once (skippable).
export type ProfileFieldKey = 'industry_code' | 'employee_count' | 'yearly_revenue' | 'goals';

export const PROFILE_FIELDS: { key: ProfileFieldKey; label: string; numeric: boolean; placeholder: string }[] = [
  { key: 'industry_code', label: 'TEÁOR kód (iparág)', numeric: false, placeholder: 'pl. 62.01' },
  { key: 'yearly_revenue', label: 'Éves árbevétel (Ft)', numeric: true, placeholder: 'pl. 50000000' },
  { key: 'employee_count', label: 'Alkalmazottak száma', numeric: true, placeholder: 'pl. 8' },
  { key: 'goals', label: 'A cég céljai', numeric: false, placeholder: 'pl. új gyártósor, digitalizáció' },
];

type ProfileLike = Pick<BusinessProfile, ProfileFieldKey>;

const isEmpty = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === '' || (typeof v === 'number' && v <= 0);

/** The key fields that are empty (an empty string, null, or a non-positive number). */
export function missingProfileFields(profile: ProfileLike | null | undefined): ProfileFieldKey[] {
  if (!profile) return [];
  return PROFILE_FIELDS.filter((f) => isEmpty(profile[f.key])).map((f) => f.key);
}

export type ProfileForm = Partial<Record<ProfileFieldKey, string>>;

/**
 * The form -> the business_profiles update. Only the filled fields go in; numbers may carry spaces or dots
 * as thousands separators ("50 000 000", "50.000.000"). Anything else that is not a whole number is an error.
 */
export function profileUpdateFromForm(form: ProfileForm): { ok: true; update: Partial<ProfileLike> } | { ok: false; error: string } {
  const update: Partial<ProfileLike> = {};
  for (const f of PROFILE_FIELDS) {
    const raw = (form[f.key] ?? '').trim();
    if (!raw) continue;
    if (f.numeric) {
      const digits = raw.replace(/[\s.]/g, ''); // \s covers the no-break space too
      if (!/^\d+$/.test(digits) || Number(digits) <= 0) return { ok: false, error: `${f.label}: egész számot adj meg.` };
      (update as Record<string, unknown>)[f.key] = Number(digits);
    } else {
      (update as Record<string, unknown>)[f.key] = raw;
    }
  }
  return { ok: true, update };
}
