import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PaywallSuccess } from '../PaywallSuccess';

jest.mock('react-native-paper', () => ({
  Button: 'Button',
  Text: 'Text',
  IconButton: 'IconButton'
}));

describe('PaywallSuccess', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders correctly', () => {
    const mockOnBack = jest.fn();

    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<PaywallSuccess onBack={mockOnBack} />);
    });

    // Check titles
    const titleInstances = root!.root.findAll(
      (node) => node.type === 'Text' && node.props.children === 'Sikeres Pro Előfizetés! 🎉'
    );
    expect(titleInstances.length).toBeGreaterThan(0);

    // Check subtitle
    const subtitleInstances = root!.root.findAll(
      (node) => node.type === 'Text' && typeof node.props.children === 'string' && node.props.children.includes('Köszönjük a bizalmat!')
    );
    expect(subtitleInstances.length).toBeGreaterThan(0);

    // Check back button
    const buttonInstances = root!.root.findAll(
      (node) => node.type === 'Button' && node.props.children === 'Vissza a Kezdőlapra'
    );
    expect(buttonInstances.length).toBeGreaterThan(0);
  });

  it('calls onBack when button is pressed', () => {
    const mockOnBack = jest.fn();

    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<PaywallSuccess onBack={mockOnBack} />);
    });

    const button = root!.root.find((node) => node.type === 'Button' && node.props.children === 'Vissza a Kezdőlapra');

    act(() => {
      button.props.onPress();
    });

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});
