import React from 'react';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { PaywallPackages } from '../PaywallPackages';
import { PurchasesPackage, PACKAGE_TYPE } from 'react-native-purchases';

// Mock Alert
Alert.alert = jest.fn();

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

  it('renders fallback mock package when packages array is empty', () => {
    let root: renderer.ReactTestRenderer | undefined;

    act(() => {
      root = renderer.create(
        <PaywallPackages
          packages={[]}
          purchasing={false}
          handlePurchase={mockHandlePurchase}
        />
      );
    });

    // Verify fallback content is rendered
    const titleInstances = root!.root.findAll(
      (node) => node.type === 'Text' && node.props.children === 'Pro Havi Tagság'
    );
    expect(titleInstances.length).toBeGreaterThan(0);

    const priceInstances = root!.root.findAll(
      (node) => {
        if (node.type !== 'Text') return false;
        const children = Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children);
        return children.includes('1 990 Ft');
      }
    );
    expect(priceInstances.length).toBeGreaterThan(0);
  });

  it('shows an alert when fallback purchase button is pressed', () => {
    let root: renderer.ReactTestRenderer | undefined;

    act(() => {
      root = renderer.create(
        <PaywallPackages
          packages={[]}
          purchasing={false}
          handlePurchase={mockHandlePurchase}
        />
      );
    });

    const buttons = root!.root.findAll(
      (node) => typeof node.props.onPress === 'function' && node.props.mode === 'contained'
    );

    act(() => {
      buttons[0].props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Figyelem',
      'Hálózati teszt üzemmód. Valós vásárlás a Google Play Sandbox segítségével történik.'
    );
    expect(mockHandlePurchase).not.toHaveBeenCalled();
  });

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
    let rootFallback: renderer.ReactTestRenderer | undefined;
    let rootList: renderer.ReactTestRenderer | undefined;

    act(() => {
      // Test fallback
      rootFallback = renderer.create(
        <PaywallPackages
          packages={[]}
          purchasing={true}
          handlePurchase={mockHandlePurchase}
        />
      );

      // Test list
      rootList = renderer.create(
        <PaywallPackages
          packages={mockPackages}
          purchasing={true}
          handlePurchase={mockHandlePurchase}
        />
      );
    });

    const fallbackButtons = rootFallback!.root.findAll(
      (node) => typeof node.props.onPress === 'function' && node.props.mode === 'contained'
    );
    expect(fallbackButtons[0].props.disabled).toBe(true);

    const listButtons = rootList!.root.findAll(
      (node) => typeof node.props.onPress === 'function' && node.props.mode === 'contained'
    );
    expect(listButtons[0].props.disabled).toBe(true);
    expect(listButtons[1].props.disabled).toBe(true);
  });
});
