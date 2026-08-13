import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * Minimal renderHook replacement, built on react-test-renderer (already the
 * project's proven-compatible test renderer, unlike @testing-library/react-native's
 * render/renderHook which needs a react-test-renderer createRoot API this
 * project's Jest setup doesn't provide). Mirrors the shape of
 * @testing-library/react-hooks' renderHook so existing hook tests need only
 * swap their import.
 */
export function renderHook<TResult, TProps = undefined>(
  callback: (props: TProps) => TResult
) {
  const result: { current: TResult } = { current: undefined as unknown as TResult };

  function TestComponent({ hookProps }: { hookProps: TProps }) {
    result.current = callback(hookProps);
    return null;
  }

  let root: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(React.createElement(TestComponent, { hookProps: undefined as TProps }));
  });

  return {
    result,
    rerender: (hookProps?: TProps) => {
      act(() => {
        root.update(React.createElement(TestComponent, { hookProps: hookProps as TProps }));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

export { act } from 'react-test-renderer';
