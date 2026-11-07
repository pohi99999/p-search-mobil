import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { HomeLoadError, type HomeLoadErrorKind } from './HomeLoadError';

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

describe('HomeLoadError', () => {
  const render = async (kind: HomeLoadErrorKind) => {
    const onRetry = jest.fn();
    let root: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomeLoadError kind={kind} onRetry={onRetry} />);
    });
    return { root: root!, onRetry, text: JSON.stringify(root!.toJSON()) };
  };

  it.each([
    ['profile', 'Nem sikerült betölteni a cégprofilodat'],
    ['matches', 'Nem sikerült betölteni a találataidat'],
  ] as const)('%s: names what failed', async (kind, title) => {
    const { text } = await render(kind);
    expect(text).toContain(title);
    expect(text).toContain('Ellenőrizd az internetkapcsolatot');
    expect(text).not.toContain('Keresés');
    expect(text).not.toContain('nincs a cégedhez illő');
  });

  it('the Újra button calls onRetry, once', async () => {
    const { root, onRetry } = await render('matches');
    const btn = root.root.findAll((n) => n.props.testID === 'load-error-retry' && typeof n.props.onPress === 'function')[0];
    await act(async () => { btn.props.onPress(); });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
