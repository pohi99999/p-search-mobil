import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PaywallOverlay } from '../PaywallOverlay';

// Mock react-native-paper to avoid Animated/SafeAreaProvider issues in React 19 testing
jest.mock('react-native-paper', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Text: 'Text',
}));

// Provide explicit mocks for react-native components without requireActual due to React 19 testing constraints in pure Node
jest.mock('react-native', () => ({
  View: 'View',
  StyleSheet: {
    create: jest.fn((styles) => styles),
    absoluteFill: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
  },
}));

describe('PaywallOverlay', () => {
  it('renders null when purchasing is false', () => {
    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<PaywallOverlay purchasing={false} />);
    });
    expect(root?.toJSON()).toBeNull();
  });

  it('renders the overlay when purchasing is true', () => {
    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<PaywallOverlay purchasing={true} />);
    });

    // Check if ActivityIndicator is rendered
    const activityIndicator = root!.root.findByType('ActivityIndicator');
    expect(activityIndicator).toBeTruthy();
    expect(activityIndicator.props.size).toBe('large');
    expect(activityIndicator.props.color).toBe('#1A237E');

    // Check if both text elements are rendered
    const textInstances = root!.root.findAllByType('Text');
    expect(textInstances.length).toBe(2);

    // Check specific texts
    expect(textInstances[0].props.children).toBe('Feldolgozás...');
    expect(textInstances[1].props.children).toContain('Kérjük, ne zárd be az appot.');
  });
});
