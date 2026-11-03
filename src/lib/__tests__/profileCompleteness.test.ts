import { missingProfileFields, profileUpdateFromForm } from '../profileCompleteness';

describe('profileCompleteness (card 431a496e)', () => {
  it("Péter's 2026-10-07 profile (only the name) misses all four key fields", () => {
    expect(missingProfileFields({ industry_code: '', employee_count: null, yearly_revenue: null, goals: '' }))
      .toEqual(['industry_code', 'yearly_revenue', 'employee_count', 'goals']);
  });

  it('a filled profile misses nothing; a zero counts as empty', () => {
    expect(missingProfileFields({ industry_code: '62.01', employee_count: 8, yearly_revenue: 50000000, goals: 'Digitalizáció' })).toEqual([]);
    expect(missingProfileFields({ industry_code: '62.01', employee_count: 0, yearly_revenue: 50000000, goals: 'x' })).toEqual(['employee_count']);
  });

  it('the form becomes an update with only the filled fields; thousands separators are accepted', () => {
    expect(profileUpdateFromForm({ industry_code: ' 62.01 ', yearly_revenue: '50 000 000', employee_count: '', goals: 'Új gyártósor' }))
      .toEqual({ ok: true, update: { industry_code: '62.01', yearly_revenue: 50000000, goals: 'Új gyártósor' } });
    expect(profileUpdateFromForm({ yearly_revenue: '50.000.000' })).toEqual({ ok: true, update: { yearly_revenue: 50000000 } });
  });

  it('a non-number in a number field is an error, nothing is saved', () => {
    const r = profileUpdateFromForm({ employee_count: 'nyolc' });
    expect(r.ok).toBe(false);
  });
});
