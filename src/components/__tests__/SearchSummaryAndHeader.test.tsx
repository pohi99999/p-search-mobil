import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Animated } from 'react-native';
import { HomeListHeader } from '../HomeListHeader';
import { HomeEmptyState } from '../HomeEmptyState';
import { AppearIn, APPEAR_MAX_STEPS, APPEAR_STEP_MS } from '../AppearIn';

jest.mock('../TesterProgress', () => ({ TesterProgress: () => null }));

afterEach(() => {
  jest.restoreAllMocks();
});

const textOf = (root: renderer.ReactTestRenderer) => JSON.stringify(root.toJSON());
const has = (root: renderer.ReactTestRenderer, testID: string) =>
  root.root.findAll((n) => n.props.testID === testID).length > 0;

// vc23 (Lumen L3): the "AI keresés kész" modal became a line on the screen.
describe('search summary on the home screen', () => {
  it('the list header shows the counts after a search that found something', async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomeListHeader showTester={false} lastSearch={{ matchesFound: 6, candidatesConsidered: 60 }} />);
    });
    expect(has(root, 'search-summary')).toBe(true);
    expect(textOf(root)).toContain('60 nyitott kiírást néztünk át, 6 illik a cégedhez.');
  });

  it('no line before any search in this session', async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomeListHeader showTester={false} lastSearch={null} />);
    });
    expect(has(root, 'search-summary')).toBe(false);
  });

  it('the header keeps a place for the other status lines, above the summary', async () => {
    const { Text } = require('react-native');
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(
        <HomeListHeader showTester={false} lastSearch={{ matchesFound: 2, candidatesConsidered: 40 }}>
          <Text testID="other-line">Frissítve</Text>
        </HomeListHeader>,
      );
    });
    const json = textOf(root);
    expect(json.indexOf('Frissítve')).toBeGreaterThan(-1);
    expect(json.indexOf('Frissítve')).toBeLessThan(json.indexOf('40 nyitott'));
  });

  it('the empty state names how many open grants were weighed', async () => {
    jest.useFakeTimers();
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(
        <HomeEmptyState kind="none" onSearch={jest.fn()} onEditProfile={jest.fn()} lastSearch={{ matchesFound: 0, candidatesConsidered: 52 }} />,
      );
    });
    expect(textOf(root)).toContain('52 nyitott kiírást néztünk át.');
    await act(async () => {
      root.update(<HomeEmptyState kind="none" onSearch={jest.fn()} onEditProfile={jest.fn()} lastSearch={null} />);
    });
    expect(has(root, 'empty-none-looked')).toBe(false);
    jest.useRealTimers();
  });
});

describe('AppearIn', () => {
  const opacityOf = (root: renderer.ReactTestRenderer) => {
    const view = root.root.findAll((n) => n.props.testID === 'appear-in')[0];
    const o = view.props.style.opacity as Animated.Value | number;
    return typeof o === 'number' ? o : (o as unknown as { __getValue: () => number }).__getValue();
  };

  it('with reduce motion on, the card is visible at once', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    let root!: renderer.ReactTestRenderer;
    await act(async () => { root = renderer.create(<AppearIn index={3}><></></AppearIn>); });
    await act(async () => { await Promise.resolve(); });
    expect(opacityOf(root)).toBe(1);
  });

  it('otherwise it starts hidden and fades in, later cards a step later', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const timing = jest.spyOn(Animated, 'timing');
    let root!: renderer.ReactTestRenderer;
    await act(async () => { root = renderer.create(<AppearIn index={2}><></></AppearIn>); });
    await act(async () => { await Promise.resolve(); });
    expect(opacityOf(root)).toBe(0);
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, delay: 2 * APPEAR_STEP_MS }));
    await act(async () => { root.update(<AppearIn index={40}><></></AppearIn>); });
    expect(timing).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ delay: APPEAR_MAX_STEPS * APPEAR_STEP_MS }));
  });
});
