import React from 'react';
import renderer from 'react-test-renderer';
import { PaywallScreen } from '../PaywallScreen';
import { useBilling } from '../../context/BillingContext';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Button, Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.useFakeTimers();

jest.mock('../../context/BillingContext', () => ({
  useBilling: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
}));

jest.mock('../../utils/error', () => ({
  getErrorMessage: jest.fn().mockImplementation((err) => {
    if (err instanceof Error) return err.message;
    return String(err);
  }),
}));

const inset = { top: 0, right: 0, bottom: 0, left: 0 };
const metrics = { insets: inset, frame: { x: 0, y: 0, width: 320, height: 640 } };

describe('PaywallScreen', () => {
  const mockNavigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  };

  const mockPurchasePackage = jest.fn().mockResolvedValue(undefined);
  const mockRestorePurchases = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigation as jest.Mock).mockReturnValue(mockNavigation);
    global.alert = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    (global.alert as jest.Mock).mockRestore();
    (console.warn as jest.Mock).mockRestore();
  });

  const renderComponent = async (billingOverrides = {}) => {
    (useBilling as jest.Mock).mockReturnValue({
      packages: [],
      purchasePackage: mockPurchasePackage,
      restorePurchases: mockRestorePurchases,
      isLoading: false,
      isPro: false,
      ...billingOverrides,
    });

    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <PaperProvider>
            <PaywallScreen />
          </PaperProvider>
        </SafeAreaProvider>
      );
    });

    await renderer.act(async () => {
      jest.runAllTimers();
    });

    return component!;
  };

  it('renders a loading indicator when isLoading is true', async () => {
    const component = await renderComponent({ isLoading: true });
    const root = component.root;
    const loaders = root.findAllByType(ActivityIndicator);
    expect(loaders.length).toBeGreaterThan(0);
  });

  it('renders success screen when user isPro', async () => {
    const component = await renderComponent({ isPro: true });
    const tree = JSON.stringify(component.toJSON());
    expect(tree).toContain('Sikeres Pro Előfizetés!');
  });

  it('renders mock package when packages array is empty', async () => {
    const component = await renderComponent({ packages: [] });
    const tree = JSON.stringify(component.toJSON());
    expect(tree).toContain('Pro Havi Tagság');
    expect(tree).toContain('1 990 Ft');
  });

  it('renders real packages when packages array is not empty', async () => {
    const mockPackage = {
      identifier: 'test_pro_1',
      product: {
        title: 'Test Pro Plan',
        description: 'Test description',
        priceString: '2 000 Ft',
      },
    };

    const component = await renderComponent({ packages: [mockPackage] });
    const tree = JSON.stringify(component.toJSON());
    expect(tree).toContain('Test Pro Plan');
    expect(tree).toContain('Test description');
    expect(tree).toContain('2 000 Ft');
  });

  it('calls purchasePackage when purchase button is pressed', async () => {
    const mockPackage = {
      identifier: 'test_pro_1',
      product: {
        title: 'Test Pro Plan',
        description: 'Test description',
        priceString: '2 000 Ft',
      },
    };

    const component = await renderComponent({ packages: [mockPackage] });
    const root = component.root;
    const buttons = root.findAllByType(Button);
    const purchaseButton = buttons.find(b => {
      const childrenStr = Array.isArray(b.props.children) ? b.props.children.join('') : String(b.props.children);
      return childrenStr.includes('Előfizetés indítása');
    });

    await renderer.act(async () => {
      if (purchaseButton) {
          await purchaseButton.props.onPress();
      }
    });

    expect(mockPurchasePackage).toHaveBeenCalledWith(mockPackage);
  });

  it('calls restorePurchases when restore button is pressed', async () => {
    const component = await renderComponent();
    const root = component.root;
    const buttons = root.findAllByType(Button);
    const restoreButton = buttons.find(b => {
      const childrenStr = Array.isArray(b.props.children) ? b.props.children.join('') : String(b.props.children);
      return childrenStr.includes('Korábbi vásárlások visszaállítása');
    });

    await renderer.act(async () => {
      if (restoreButton) {
        await restoreButton.props.onPress();
      }
    });

    expect(mockRestorePurchases).toHaveBeenCalled();
  });
});
