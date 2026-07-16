import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PaywallScreen } from '../PaywallScreen';

// We mock react-native explicitly
jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: ({ children, testID, ...props }: any) => <div testID={testID} {...props}>{children}</div>,
    Text: ({ children, testID, ...props }: any) => <span testID={testID} {...props}>{children}</span>,
    TouchableOpacity: class extends React.Component { render() { return <div>{this.props.children}</div>; } },
    ScrollView: ({ children, testID, ...props }: any) => <div testID={testID} {...props}>{children}</div>,
    Platform: { OS: 'ios' },
    StyleSheet: { create: (s: any) => s, absoluteFill: {} },
    NativeModules: {},
    TurboModuleRegistry: { getEnforcing: () => null }
  };
});

// Since the component uses `Button` from react-native-paper, we mock it as a class component
// so findByType works correctly and preserves props.
jest.mock('react-native-paper', () => {
  const React = require('react');
  return {
    Text: class extends React.Component { render() { return <span>{this.props.children}</span>; } },
    Button: class extends React.Component { render() { return <div testID="button">{this.props.children}</div>; } },
    Card: Object.assign(({ children }: any) => <div>{children}</div>, {
      Content: ({ children }: any) => <div>{children}</div>,
      Actions: ({ children }: any) => <div>{children}</div>,
    }),
    useTheme: () => ({ colors: { primary: 'blue' } }),
    ActivityIndicator: () => <div testID="activity-indicator" />,
    IconButton: class extends React.Component { render() { return <div testID="icon-button">{this.props.icon}</div>; } },
    List: {
      Item: ({ title }: any) => <div><span>{title}</span></div>
    },
    Banner: ({ children }: any) => <div><span>{children}</span></div>,
    Snackbar: ({ children }: any) => <div><span>{children}</span></div>,
  };
});

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
  }),
}));

const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();

let mockBillingContext = {
  isPro: false,
  isLoading: false,
  packages: [],
  purchasePackage: mockPurchasePackage,
  restorePurchases: mockRestorePurchases,
};

jest.mock('../../context/BillingContext', () => ({
  useBilling: () => mockBillingContext,
}));

// mock global.alert to avoid error logs in the test runner
global.alert = jest.fn();

describe('PaywallScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBillingContext = {
      isPro: false,
      isLoading: false,
      packages: [],
      purchasePackage: mockPurchasePackage,
      restorePurchases: mockRestorePurchases,
    };
  });

  it('renders successfully for a Pro user and handles goBack', () => {
    mockBillingContext.isPro = true;
    let tree: any;
    act(() => {
      tree = renderer.create(<PaywallScreen />);
    });

    const instance = tree.root;
    const { Button } = require('react-native-paper');

    // Check if success message is present
    expect(instance.findByProps({ children: 'Sikeres Pro Előfizetés! 🎉' })).toBeTruthy();

    // Check goBack functionality
    const buttons = instance.findAllByType(Button);
    const goBackButton = buttons.find((b: any) => b.props.children === 'Vissza a Kezdőlapra');

    act(() => {
      goBackButton.props.onPress();
    });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('renders ActivityIndicator when loading', () => {
    mockBillingContext.isLoading = true;
    let tree: any;
    act(() => {
      tree = renderer.create(<PaywallScreen />);
    });
    const instance = tree.root;

    expect(instance.findByProps({ testID: 'activity-indicator' })).toBeTruthy();
  });

  it('renders mock package when no packages are available', () => {
    mockBillingContext.isLoading = false;
    mockBillingContext.packages = [];
    let tree: any;
    act(() => {
      tree = renderer.create(<PaywallScreen />);
    });
    const instance = tree.root;

    // "Pro Havi Tagság" is the hardcoded text for the mock package
    expect(instance.findByProps({ children: 'Pro Havi Tagság' })).toBeTruthy();
  });

  it('renders available packages and calls purchasePackage when pressed', async () => {
    const mockPkg = {
      identifier: 'test-pkg',
      product: {
        title: 'Test Pro',
        description: 'Test Desc',
        priceString: '$9.99'
      }
    };
    mockBillingContext.packages = [mockPkg as any];
    mockBillingContext.isLoading = false;

    let tree: any;
    act(() => {
      tree = renderer.create(<PaywallScreen />);
    });
    const instance = tree.root;
    const { Button } = require('react-native-paper');

    expect(instance.findByProps({ children: 'Test Pro' })).toBeTruthy();
    expect(instance.findByProps({ children: '$9.99' })).toBeTruthy();

    const buttons = instance.findAllByType(Button);
    const purchaseButton = buttons.find((b: any) => b.props.children === 'Előfizetés indítása');

    await act(async () => {
      purchaseButton.props.onPress();
    });

    expect(mockPurchasePackage).toHaveBeenCalledWith(mockPkg);
  });

  it('calls restorePurchases when the restore button is pressed', async () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<PaywallScreen />);
    });
    const instance = tree.root;
    const { Button } = require('react-native-paper');

    const buttons = instance.findAllByType(Button);
    const restoreButton = buttons.find((b: any) => b.props.children === 'Korábbi vásárlások visszaállítása');

    await act(async () => {
      restoreButton.props.onPress();
    });

    expect(mockRestorePurchases).toHaveBeenCalled();
  });
});
