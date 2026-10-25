import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PaywallPackages } from '../PaywallPackages';

// Péter 10518: no claim without data on the paywall (also a Play policy risk). The packages, their prices and
// their order must not change with the copy.
const pkg = (identifier: string, packageType: string, priceString: string) =>
  ({ identifier, packageType, product: { identifier, title: identifier, priceString, introPrice: null, discounts: [] } }) as any;

describe('paywall claims', () => {
  it('shows every package, in the given order, with its price, and no "LEGNÉPSZERŰBB" badge', () => {
    const packages = [pkg('annual', 'ANNUAL', '29 990 Ft'), pkg('monthly', 'MONTHLY', '2 990 Ft')];
    let root: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<PaywallPackages packages={packages} purchasing={false} handlePurchase={jest.fn()} />);
    });
    const text = JSON.stringify(root!.toJSON());
    expect(text).not.toContain('LEGNÉPSZERŰBB');
    expect(text.indexOf('29 990 Ft')).toBeGreaterThan(-1);
    expect(text.indexOf('29 990 Ft')).toBeLessThan(text.indexOf('2 990 Ft"'));
    expect(text.indexOf('P-Search Pro éves')).toBeLessThan(text.indexOf('P-Search Pro havi'));
  });
});

