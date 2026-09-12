import { formatIntroOffer } from '../introOffer';

const base = { priceString: '3 990 Ft', subscriptionPeriod: 'P1M' as string | null };

describe('formatIntroOffer', () => {
  it('formats the 3-month intro offer from the store product', () => {
    const s = formatIntroOffer({ ...base, introPrice: { priceString: '2 990 Ft', cycles: 3, periodNumberOfUnits: 1, periodUnit: 'MONTH', price: 2990, period: 'P1M' } } as never);
    expect(s).toBe('Első 3 hónap 2 990 Ft, utána 3 990 Ft/hó');
  });
  it('handles a single multi-month intro period (cycles=1, 3 months)', () => {
    const s = formatIntroOffer({ ...base, introPrice: { priceString: '2 990 Ft', cycles: 1, periodNumberOfUnits: 3, periodUnit: 'MONTH', price: 2990, period: 'P3M' } } as never);
    expect(s).toBe('Első 3 hónap 2 990 Ft, utána 3 990 Ft/hó');
  });
  it('returns null when there is no intro offer', () => {
    expect(formatIntroOffer({ ...base, introPrice: null } as never)).toBeNull();
  });
  it('yearly base gets the /év suffix', () => {
    const s = formatIntroOffer({ priceString: '39 990 Ft', subscriptionPeriod: 'P1Y', introPrice: { priceString: '29 990 Ft', cycles: 1, periodNumberOfUnits: 1, periodUnit: 'YEAR', price: 29990, period: 'P1Y' } } as never);
    expect(s).toBe('Első 1 év 29 990 Ft, utána 39 990 Ft/év');
  });
});
