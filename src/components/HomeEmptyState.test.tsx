import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { HomeEmptyState } from './HomeEmptyState';

// Handle React Native Paper component interactions that require timers (like Surface, ActivityIndicator)
beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

describe('HomeEmptyState', () => {
  it('renders correctly with default props (Ismeretlen)', async () => {
    const onRefreshMock = jest.fn();

    let root: renderer.ReactTestRenderer | undefined;
    await act(async () => {
      root = renderer.create(
        <HomeEmptyState onRefresh={onRefreshMock} />
      );
    });

    if (!root) {
      throw new Error('Component failed to render');
    }

    // Verify it shows "Ismeretlen" when no industryCode is provided
    const texts = root.root.findAll(node => {
      if (node.props.children) {
        const children = Array.isArray(node.props.children)
          ? node.props.children.join('')
          : String(node.props.children);
        return children.includes('Ismeretlen');
      }
      return false;
    });

    expect(texts.length).toBeGreaterThan(0);
  });

  it('renders correctly with a specific industryCode', async () => {
    const onRefreshMock = jest.fn();
    const testCode = '6201';

    let root: renderer.ReactTestRenderer | undefined;
    await act(async () => {
      root = renderer.create(
        <HomeEmptyState industryCode={testCode} onRefresh={onRefreshMock} />
      );
    });

    if (!root) {
      throw new Error('Component failed to render');
    }

    // Verify it shows the specific code
    const texts = root.root.findAll(node => {
      if (node.props.children) {
        const children = Array.isArray(node.props.children)
          ? node.props.children.join('')
          : String(node.props.children);
        return children.includes(testCode);
      }
      return false;
    });

    expect(texts.length).toBeGreaterThan(0);
  });

  it('calls onRefresh when the button is pressed', async () => {
    const onRefreshMock = jest.fn();

    let root: renderer.ReactTestRenderer | undefined;
    await act(async () => {
      root = renderer.create(
        <HomeEmptyState onRefresh={onRefreshMock} />
      );
    });

    if (!root) {
      throw new Error('Component failed to render');
    }

    // Find the Button by looking for something that has an onPress and mode="contained" (which is the Paper button prop)
    const button = root.root.find(
      (node) => node.props.onPress !== undefined && node.props.mode === 'contained'
    );

    expect(button).toBeDefined();

    await act(async () => {
      button.props.onPress();
    });

    expect(onRefreshMock).toHaveBeenCalledTimes(1);
  });
});
