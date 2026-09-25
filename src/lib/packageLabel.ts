import type { PurchasesPackage } from 'react-native-purchases';

/**
 * Own, fixed labels for the paywall cards.
 *
 * The store's product title is never shown: on Play it is the raw product name
 * plus the package id and review state, e.g.
 * "P-Search Pro (com.pohankaestarsa.psearch (unreviewed))" (owner test 2026-09-25).
 * The label comes from the RevenueCat package type, which is stable across stores.
 */
export const PRO_BRAND = 'P-Search Pro';

export function packageLabel(pkg: Pick<PurchasesPackage, 'packageType' | 'identifier'>): string {
  switch (pkg.packageType) {
    case 'MONTHLY':
      return `${PRO_BRAND} havi`;
    case 'ANNUAL':
      return `${PRO_BRAND} éves`;
    case 'SIX_MONTH':
      return `${PRO_BRAND} féléves`;
    case 'THREE_MONTH':
      return `${PRO_BRAND} negyedéves`;
    case 'WEEKLY':
      return `${PRO_BRAND} heti`;
    case 'LIFETIME':
      return `${PRO_BRAND} örökös`;
    default:
      return PRO_BRAND;
  }
}

export function packageDescription(pkg: Pick<PurchasesPackage, 'packageType' | 'identifier'>): string {
  switch (pkg.packageType) {
    case 'MONTHLY':
      return 'Havonta megújul, bármikor lemondható. Hozzáférés az összes Pro funkcióhoz.';
    case 'ANNUAL':
      return 'Évente egyben fizetve, bármikor lemondható. Hozzáférés az összes Pro funkcióhoz.';
    default:
      return 'Hozzáférés az összes Pro funkcióhoz.';
  }
}
