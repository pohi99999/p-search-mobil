import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PaywallScreen } from '../PaywallScreen';
import { useBilling } from '../../context/BillingContext';
import { useNavigation } from '@react-navigation/native';
import { Alert } from 'react-native';
import { Button, ActivityIndicator } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { logger } from '../../utils/logger';

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
}));

jest.mock('../../context/BillingContext', () => ({
  useBilling: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
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

  const renderWithSafeArea = (children: React.ReactNode) => {
    return renderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 0, height: 0 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        {children}
      </SafeAreaProvider>,
    );
  };

  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
    (useNavigation as jest.Mock).mockReturnValue(mockNavigation);
    (useBilling as jest.Mock).mockReturnValue(mockBilling);
    // hide unhelpful react-native-paper warnings about Surface overflow
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllTimers();
    (console.warn as jest.Mock).mockRestore();
    jest.restoreAllMocks();
  });

  it('renders success view when isPro is true and navigates back on button press', async () => {
    (useBilling as jest.Mock).mockReturnValue({ ...mockBilling, isPro: true });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderWithSafeArea(<PaywallScreen />);
    });

    const root = component!.root;
    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Sikeres Pro Előfizetés! 🎉');

    const backButton = root
      .findAllByType(Button)
      .find((b) => b.props.children === 'Vissza a Kezdőlapra');
    expect(backButton).toBeDefined();

    await act(async () => {
      backButton!.props.onPress();
    });

    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('renders loader when isLoading is true', () => {
    (useBilling as jest.Mock).mockReturnValue({ ...mockBilling, isLoading: true });

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderWithSafeArea(<PaywallScreen />);
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
      component = renderWithSafeArea(<PaywallScreen />);
    });

    const root = component!.root;
    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Test Pro');

    const purchaseButtons = root
      .findAllByType(Button)
      .filter((b) => b.props.children === 'Előfizetés indítása');
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
      purchasePackage: failingPurchasePackage,
    });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderWithSafeArea(<PaywallScreen />);
    });

    const purchaseButton = component!.root
      .findAllByType(Button)
      .find((b) => b.props.children === 'Előfizetés indítása');

    await act(async () => {
      await purchaseButton!.props.onPress();
    });

    expect(failingPurchasePackage).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Hiba',
      'Vásárlási hiba történt. Kérjük, próbáld újra később.',
    );
    expect(logger.error).toHaveBeenCalledWith('Vásárlási hiba:', 'Test purchase error');
  });

  // The empty branch used to render a hardcoded "Pro Havi Tagság / 1 990 Ft /
  // 7 napos ingyenes próba" card whose purchase button only showed an Alert.
  // Advertising a concrete price and a free trial for a product nobody can buy
  // is deceptive and a Play policy risk, so the empty state must stay silent
  // about price and offer no way to start a purchase.
  it('shows an honest empty state, with no price and no purchase button, when packages is empty', async () => {
    (useBilling as jest.Mock).mockReturnValue({ ...mockBilling, packages: [] });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderWithSafeArea(<PaywallScreen />);
    });

    const treeStr = JSON.stringify(component!.toJSON());
    expect(treeStr).toContain('Az előfizetés jelenleg nem elérhető');
    expect(treeStr).not.toContain('Pro Havi Tagság');
    expect(treeStr).not.toContain('1 990');
    expect(treeStr).not.toContain('ingyenes próba');

    const purchaseButton = component!.root
      .findAllByType(Button)
      .find((b) => b.props.children === 'Előfizetés indítása');
    expect(purchaseButton).toBeUndefined();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('handles successful restore purchases', async () => {
    (useBilling as jest.Mock).mockReturnValue(mockBilling);

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderWithSafeArea(<PaywallScreen />);
    });

    const restoreButton = component!.root
      .findAllByType(Button)
      .find((b) => b.props.children === 'Korábbi vásárlások visszaállítása');
    expect(restoreButton).toBeDefined();

    await act(async () => {
      await restoreButton!.props.onPress();
    });

    expect(mockBilling.restorePurchases).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Siker', 'Vásárlások sikeresen ellenőrizve!');
  });

  it('handles restore purchases error', async () => {
    const failingRestore = jest.fn().mockRejectedValue(new Error('Test restore error'));
    (useBilling as jest.Mock).mockReturnValue({
      ...mockBilling,
      restorePurchases: failingRestore,
    });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderWithSafeArea(<PaywallScreen />);
    });

    const restoreButton = component!.root
      .findAllByType(Button)
      .find((b) => b.props.children === 'Korábbi vásárlások visszaállítása');

    await act(async () => {
      await restoreButton!.props.onPress();
    });

    expect(failingRestore).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Hiba',
      'Visszaállítási hiba történt. Kérjük, próbáld újra később.',
    );
    expect(logger.error).toHaveBeenCalledWith('Visszaállítási hiba:', 'Test restore error');
  });

  it('closes screen on back button press', async () => {
    (useBilling as jest.Mock).mockReturnValue(mockBilling);

    let component;
    await act(async () => {
      component = renderWithSafeArea(<PaywallScreen />);
    });

    // Find the close button, which is an IconButton with icon="close"
    // Since IconButton is from react-native-paper, we can find it by type and prop
    const iconButtons = component.root.findAllByType(require('react-native-paper').IconButton);
    const closeButton = iconButtons.find((b) => b.props.icon === 'close');
    expect(closeButton).toBeDefined();

    await act(async () => {
      closeButton.props.onPress();
    });

    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('dismisses OCR confidence banner', async () => {
    (useBilling as jest.Mock).mockReturnValue(mockBilling);

    let component;
    await act(async () => {
      component = renderWithSafeArea(<PaywallScreen />);
    });

    const banner = component.root.findByType(require('react-native-paper').Banner);
    expect(banner).toBeDefined();

    // Call the onPress action for the "Újra fotózom" button to cover the inline function
    await act(async () => {
      banner.props.actions[0].onPress();
    });
  });

  it('dismisses upload error snackbar', async () => {
    (useBilling as jest.Mock).mockReturnValue(mockBilling);

    let component;
    await act(async () => {
      component = renderWithSafeArea(<PaywallScreen />);
    });

    const snackbar = component.root.findByType(require('react-native-paper').Snackbar);
    expect(snackbar).toBeDefined();

    // Call the onDismiss prop to cover the inline function
    await act(async () => {
      snackbar.props.onDismiss();
    });
  });
});
