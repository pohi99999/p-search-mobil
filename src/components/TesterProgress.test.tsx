import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TesterProgress } from './TesterProgress';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('TesterProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders null initially while loading', async () => {
    let resolvePromise: (value: any) => void = () => {};
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    (AsyncStorage.getItem as jest.Mock).mockReturnValue(promise);

    let root: renderer.ReactTestRenderer | undefined;

    // Create the component - it will immediately start the useEffect
    await act(async () => {
      root = renderer.create(<TesterProgress />);
    });

    // Since the promise is not resolved yet, it should be in loading state
    // But due to how act works with initial render + effect, the effect runs synchronously in test
    // So we need to check the tree immediately after render but before resolving the promise
    expect(root?.toJSON()).toBeNull();

    // Now resolve the promise to complete the effect
    await act(async () => {
      resolvePromise(null);
      // Give the next tick a chance to run so state updates
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  });

  it('renders correctly when AsyncStorage throws an error (0 days active)', async () => {
    // Mock AsyncStorage to throw an error
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('AsyncStorage error'));

    let root;
    await act(async () => {
      root = renderer.create(<TesterProgress />);
    });

    // We expect 0 days active because the mock data was removed
    const daysTextInstances = root.root.findAll(
      (node) =>
        node.type === 'Text' &&
        node.props.children &&
        (
          node.props.children === '0/14 nap aktív' ||
          (Array.isArray(node.props.children) && node.props.children.join('') === '0/14 nap aktív')
        )
    );

    expect(daysTextInstances.length).toBeGreaterThan(0);
  });

  it('handles empty storage correctly and adds today', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

    let root;
    await act(async () => {
      root = renderer.create(<TesterProgress />);
    });

    // We expect 1 day active
    const daysTextInstances = root.root.findAll(
      (node) =>
        node.type === 'Text' &&
        node.props.children &&
        (
          node.props.children === '1/14 nap aktív' ||
          (Array.isArray(node.props.children) && node.props.children.join('') === '1/14 nap aktív')
        )
    );

    expect(daysTextInstances.length).toBeGreaterThan(0);
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it('handles existing storage and does not add today if already present', async () => {
    const today = new Date().toISOString().split('T')[0];
    const existingDays = ['2026-06-13', '2026-06-14', today];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(existingDays));

    let root;
    await act(async () => {
      root = renderer.create(<TesterProgress />);
    });

    // We expect 3 days active
    const daysTextInstances = root.root.findAll(
      (node) =>
        node.type === 'Text' &&
        node.props.children &&
        (
          node.props.children === '3/14 nap aktív' ||
          (Array.isArray(node.props.children) && node.props.children.join('') === '3/14 nap aktív')
        )
    );

    expect(daysTextInstances.length).toBeGreaterThan(0);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('shows completion message when required days are met', async () => {
    const today = new Date().toISOString().split('T')[0];
    const existingDays = Array.from({ length: 14 }, (_, i) => `2026-06-${i+1}`);
    if (!existingDays.includes(today)) {
        existingDays.push(today);
    }

    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(existingDays));

    let root;
    await act(async () => {
      root = renderer.create(<TesterProgress />);
    });

    const completionInstances = root.root.findAll(
      (node) =>
        node.type === 'Text' &&
        node.props.children === 'Köszönjük! Teljesítetted a 14 napos kötelező tesztelési fázist. 🎉'
    );

    expect(completionInstances.length).toBeGreaterThan(0);
  });
});
