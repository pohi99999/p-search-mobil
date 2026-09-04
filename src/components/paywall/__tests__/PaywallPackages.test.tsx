import React from 'react';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { PaywallPackages } from '../PaywallPackages';
import { PurchasesPackage, PACKAGE_TYPE } from 'react-native-purchases';

// Mock Alert
Alert.alert = jest.fn();

/**
 * Collects every rendered string in the tree, so a regression test can assert on
 * what the user actually sees rather than on a specific node we remembered to check.
 */
const collectText = (node: renderer.ReactTestRendererJSON | string | null): string => {
  if (node === null) return '';
  if (typeof node === 'string') return node;
  const children = node.children ?? [];
  return children.map(collectText).join(' ');
};

const renderedText = (root: renderer.ReactTestRenderer): string => {
  const json = root.toJSON();
  const nodes = Array.isArray(json) ? json : [json];
  return nodes.map(collectText).join(' ');
};

describe('PaywallPackages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockHandlePurchase = jest.fn();

  const mockPackages: PurchasesPackage[] = [
    {
      identifier: 'monthly_pro',
      packageType: PACKAGE_TYPE.MONTHLY,
      product: {
        identifier: 'pro_monthly',
        description: 'Pro Monthly Subscription',
        title: 'Pro Monthly',
        price: 4.99,
        priceString: '$4.99',
        currencyCode: 'USD',
        introPrice: null,
        discounts: []
      }
    } as any,
    {
      identifier: 'yearly_pro',
      packageType: PACKAGE_TYPE.ANNUAL,
      product: {
        identifier: 'pro_yearly',
        description: 'Pro Yearly Subscription',
        title: 'Pro Yearly',
        price: 49.99,
        priceString: '$49.99',
        currencyCode: 'USD',
        introPrice: null,
        discounts: []
      }
    } as any,
  ];

  const renderEmpty = (purchasing = false) => {
    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(
        <PaywallPackages
          packages={[]}
          purchasing={purchasing}
          handlePurchase={mockHandlePurchase}
        />
      );
    });
    return root!;
  };

  describe('when there is no real store product', () => {
    it('says the subscription is unavailable instead of advertising a package', () => {
      const text = renderedText(renderEmpty());

      expect(text).toContain('Az előfizetés jelenleg nem elérhető');
      expect(text).toContain('Amint elérhetővé válik');
    });

    // Regression guard. The empty branch used to render a hardcoded
    // "Pro Havi Tagság / 1 990 Ft / hó / 7 napos ingyenes próba" card with a
    // purchase button that only showed an Alert -- a concrete price and free
    // trial advertised for a product nobody could buy. That is deceptive and a
    // Play policy risk, and it shipped all the way into the live web bundle.
    // This test fails if any price or trial promise creeps back in.
    it('never shows a price, a package name or a free trial', () => {
      const text = renderedText(renderEmpty());

      expect(text).not.toMatch(/1\s*990/);
      expect(text).not.toMatch(/Ft/);
      expect(text).not.toMatch(/próba/i);
      expect(text).not.toMatch(/ingyenes/i);
      expect(text).not.toMatch(/Pro Havi Tagság/);
      expect(text).not.toMatch(/LEGNÉPSZERŰBB/);
      expect(text).not.toMatch(/\/\s*hó/);
    });

    it('offers no purchase button at all', () => {
      const root = renderEmpty();

      const buttons = root.root.findAll(
        (node) => typeof node.props.onPress === 'function' && node.props.mode === 'contained'
      );

      expect(buttons).toHaveLength(0);
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockHandlePurchase).not.toHaveBeenCalled();
    });

    it('renders the same way while a purchase is in flight', () => {
      // Nothing is purchasable here, so `purchasing` must not change the output.
      expect(renderedText(renderEmpty(true))).toBe(renderedText(renderEmpty(false)));
    });
  });

  describe('when real packages are available', () => {
    it('renders provided packages correctly', () => {
      let root: renderer.ReactTestRenderer | undefined;

      act(() => {
        root = renderer.create(
          <PaywallPackages
            packages={mockPackages}
            purchasing={false}
            handlePurchase={mockHandlePurchase}
          />
        );
      });

      // Check first package
      const title1 = root!.root.findAll(
        (node) => node.type === 'Text' && node.props.children === 'Pro Monthly'
      );
      expect(title1.length).toBeGreaterThan(0);

      const price1 = root!.root.findAll(
        (node) => node.type === 'Text' && node.props.children === '$4.99'
      );
      expect(price1.length).toBeGreaterThan(0);

      // Check second package
      const title2 = root!.root.findAll(
        (node) => node.type === 'Text' && node.props.children === 'Pro Yearly'
      );
      expect(title2.length).toBeGreaterThan(0);

      const price2 = root!.root.findAll(
        (node) => node.type === 'Text' && node.props.children === '$49.99'
      );
      expect(price2.length).toBeGreaterThan(0);
    });

    it('calls handlePurchase with correct package when button is pressed', () => {
      let root: renderer.ReactTestRenderer | undefined;

      act(() => {
        root = renderer.create(
          <PaywallPackages
            packages={mockPackages}
            purchasing={false}
            handlePurchase={mockHandlePurchase}
          />
        );
      });

      const buttons = root!.root.findAll(
        (node) => typeof node.props.onPress === 'function' && node.props.mode === 'contained'
      );

      expect(buttons.length).toBe(2);

      act(() => {
        buttons[1].props.onPress();
      });

      expect(mockHandlePurchase).toHaveBeenCalledTimes(1);
      expect(mockHandlePurchase).toHaveBeenCalledWith(mockPackages[1]);
    });

    it('disables buttons when purchasing is true', () => {
      let rootList: renderer.ReactTestRenderer | undefined;

      act(() => {
        rootList = renderer.create(
          <PaywallPackages
            packages={mockPackages}
            purchasing={true}
            handlePurchase={mockHandlePurchase}
          />
        );
      });

      const listButtons = rootList!.root.findAll(
        (node) => typeof node.props.onPress === 'function' && node.props.mode === 'contained'
      );
      expect(listButtons[0].props.disabled).toBe(true);
      expect(listButtons[1].props.disabled).toBe(true);
    });
  });
});
