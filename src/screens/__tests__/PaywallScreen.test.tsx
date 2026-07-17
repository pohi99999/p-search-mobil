import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PaywallScreen } from '../PaywallScreen';
import { useBilling } from '../../context/BillingContext';
import { useNavigation } from '@react-navigation/native';
import { Button, ActivityIndicator } from 'react-native-paper';

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
}));

jest.mock('../../context/BillingContext', () => ({
  useBilling: jest.fn(),
}));

jest.mock('../../utils/error', () => ({
  getErrorMessage: (err: any) => err.message || 'Hiba történt',
  isPurchasesError: () => false,
}));

// Mock useTheme to prevent errors if internally used by r-n-p
jest.mock('react-native-paper', () => {
  const Actual = jest.requireActual('react-native-paper');
  return {
    ...Actual,
    useTheme: () => ({ colors: { primary: '#000' } }),
  };
});

// Fix "No safe area value available" from r-n-p Snackbar internal usage
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: jest.fn().mockImplementation(({ children }) => children),
    SafeAreaConsumer: jest.fn().mockImplementation(({ children }) => children(inset)),
    useSafeAreaInsets: jest.fn().mockImplementation(() => inset),
  };
});

// Provide timers mock
jest.useFakeTimers();

describe('PaywallScreen', () => {
  const mockNavigation = {
    goBack: jest.fn(),
  };

  const mockBilling = {
    packages: [],
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    isLoading: false,
    isPro: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigation as jest.Mock).mockReturnValue(mockNavigation);
    (useBilling as jest.Mock).mockReturnValue(mockBilling);
    global.alert = jest.fn();
    // hide unhelpful react-native-paper warnings about Surface overflow
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllTimers();
    (console.warn as jest.Mock).mockRestore();
  });

  it('renders success view when isPro is true and navigates back on button press', async () => {
    (useBilling as jest.Mock).mockReturnValue({ ...mockBilling, isPro: true });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<PaywallScreen />);
    });

    const root = component!.root;
    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Sikeres Pro Előfizetés! 🎉');

    const backButton = root.findAllByType(Button).find(
      (b) => b.props.children === 'Vissza a Kezdőlapra'
    );
    expect(backButton).toBeDefined();

    await act(async () => {
      backButton!.props.onPress();
    });

    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('renders loader when isLoading is true', async () => {
    (useBilling as jest.Mock).mockReturnValue({ ...mockBilling, isLoading: true });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<PaywallScreen />);
    });

    const root = component!.root;
    const loader = root.findByType(ActivityIndicator);
    expect(loader).toBeDefined();
  });

  it('renders available packages and handles purchase', async () => {
    const mockPackages = [
      {
        identifier: 'test_pkg',
        product: {
          title: 'Test Pro',
          description: 'Test description',
          priceString: '1000 Ft',
        },
      },
    ];

    (useBilling as jest.Mock).mockReturnValue({ ...mockBilling, packages: mockPackages });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<PaywallScreen />);
    });

    const root = component!.root;
    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Test Pro');

    const purchaseButtons = root.findAllByType(Button).filter(
      (b) => b.props.children === 'Előfizetés indítása'
    );
    expect(purchaseButtons.length).toBe(1);

    await act(async () => {
      purchaseButtons[0].props.onPress();
    });

    expect(mockBilling.purchasePackage).toHaveBeenCalledWith(mockPackages[0]);
  });

  it('handles purchase error and displays alert', async () => {
    const mockPackages = [
      {
        identifier: 'test_pkg',
        product: { title: 'Test', description: 'Test', priceString: '100' },
      },
    ];

    const mockError = new Error('Test purchase error');
    const failingPurchasePackage = jest.fn().mockRejectedValue(mockError);

    (useBilling as jest.Mock).mockReturnValue({
      ...mockBilling,
      packages: mockPackages,
      purchasePackage: failingPurchasePackage
    });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<PaywallScreen />);
    });

    const purchaseButton = component!.root.findAllByType(Button).find(
      (b) => b.props.children === 'Előfizetés indítása'
    );

    await act(async () => {
      await purchaseButton!.props.onPress();
    });

    expect(failingPurchasePackage).toHaveBeenCalled();
    expect(global.alert).toHaveBeenCalledWith('Vásárlási hiba: Test purchase error');
  });

  it('renders fallback mock package when packages is empty and handles mock purchase', async () => {
    (useBilling as jest.Mock).mockReturnValue({ ...mockBilling, packages: [] });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<PaywallScreen />);
    });

    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Pro Havi Tagság');
    expect(treeStr).toContain('1 990 Ft');

    const purchaseButton = component!.root.findAllByType(Button).find(
      (b) => b.props.children === 'Előfizetés indítása'
    );
    expect(purchaseButton).toBeDefined();

    await act(async () => {
      await purchaseButton!.props.onPress();
    });

    expect(global.alert).toHaveBeenCalledWith('Hálózati teszt üzemmód. Valós vásárlás a Google Play Sandbox segítségével történik.');
  });

  it('handles successful restore purchases', async () => {
    (useBilling as jest.Mock).mockReturnValue(mockBilling);

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<PaywallScreen />);
    });

    const restoreButton = component!.root.findAllByType(Button).find(
      (b) => b.props.children === 'Korábbi vásárlások visszaállítása'
    );
    expect(restoreButton).toBeDefined();

    await act(async () => {
      await restoreButton!.props.onPress();
    });

    expect(mockBilling.restorePurchases).toHaveBeenCalled();
    expect(global.alert).toHaveBeenCalledWith('Vásárlások sikeresen ellenőrizve!');
  });

  it('handles restore purchases error', async () => {
    const failingRestore = jest.fn().mockRejectedValue(new Error('Test restore error'));
    (useBilling as jest.Mock).mockReturnValue({
      ...mockBilling,
      restorePurchases: failingRestore
    });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<PaywallScreen />);
    });

    const restoreButton = component!.root.findAllByType(Button).find(
      (b) => b.props.children === 'Korábbi vásárlások visszaállítása'
    );

    await act(async () => {
      await restoreButton!.props.onPress();
    });

    expect(failingRestore).toHaveBeenCalled();
    expect(global.alert).toHaveBeenCalledWith('Visszaállítási hiba: Test restore error');
  });
});
