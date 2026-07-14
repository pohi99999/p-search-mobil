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

  it('uses fallback mock data when AsyncStorage throws an error', async () => {
    // Mock AsyncStorage to throw an error
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('AsyncStorage error'));

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
