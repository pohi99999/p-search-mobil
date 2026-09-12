/**
 * Formats a RevenueCat introductory offer into a Hungarian sentence, read from
 * the store product (never hardcoded). The Play offer is the source of truth
 * (owner note 2026-09-12: 'bevezeto-2990-3ho', 3 months at a discount, then the
 * base monthly price). If the product carries no intro offer, returns null and
 * the UI shows the plain recurring price.
 */
import type { PurchasesStoreProduct } from 'react-native-purchases';

const UNIT_HU: Record<string, string> = { DAY: 'nap', WEEK: 'hét', MONTH: 'hónap', YEAR: 'év' };

/** Base subscription period ('P1M' -> '/hó') for the "utána" suffix. */
function basePeriodSuffix(subscriptionPeriod?: string | null): string {
  switch (subscriptionPeriod) {
    case 'P1W': return '/hét';
    case 'P1M': return '/hó';
    case 'P3M': return '/negyedév';
    case 'P1Y': return '/év';
    default: return '';
  }
}

export function formatIntroOffer(product: Pick<PurchasesStoreProduct, 'introPrice' | 'priceString' | 'subscriptionPeriod'>): string | null {
  const intro = product.introPrice;
  if (!intro || !intro.priceString) return null;
  const total = (intro.cycles || 1) * (intro.periodNumberOfUnits || 1);
  const unit = UNIT_HU[intro.periodUnit] ?? '';
  const dur = unit ? `${total} ${unit}` : `${total}`;
  const suffix = basePeriodSuffix(product.subscriptionPeriod);
  return `Első ${dur} ${intro.priceString}, utána ${product.priceString}${suffix}`;
}
