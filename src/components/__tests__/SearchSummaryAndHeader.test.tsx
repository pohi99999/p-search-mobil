import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Animated, Platform } from 'react-native';
import { HomeListHeader } from '../HomeListHeader';
import { SearchAnnouncer } from '../SearchSummary';
import { HomeEmptyState } from '../HomeEmptyState';
import { AppearIn, APPEAR_MAX_STEPS, APPEAR_STEP_MS } from '../AppearIn';

jest.mock('../TesterProgress', () => ({ TesterProgress: 'TesterProgress' }));

// Every tree is unmounted after its test (the SettingsScreen.round2 "mounted" pattern). An AppearIn left mounted kept
// its Animated.timing running past the Jest environment's teardown, and the next test file in the same worker failed
// with "import after the environment has been torn down" (Kenshin, CI run 44896239132: a different file each time).
const mounted: renderer.ReactTestRenderer[] = [];
const create = (el: React.ReactElement) => {
  const r = renderer.create(el);
  mounted.push(r);
  return r;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((r) => r.unmount());
  });
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
      root = create(<HomeListHeader showTester={false} lastSearch={{ matchesFound: 6, candidatesConsidered: 60 }} />);
    });
    expect(has(root, 'search-summary')).toBe(true);
    expect(textOf(root)).toContain('60 nyitott kiírást néztünk át, 6 illik a cégedhez.');
  });

  // Ellenőr #268: with a list on screen, a search that found nothing gave no answer at all.
  it('a search that found nothing gets the line too, with the none text', async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = create(<HomeListHeader showTester={false} lastSearch={{ matchesFound: 0, candidatesConsidered: 54 }} />);
    });
    expect(has(root, 'search-summary')).toBe(true);
    expect(textOf(root)).toContain('54 nyitott kiírást néztünk át, most egyik sem illik a cégedhez.');
  });

  it('the tester card is in the header when asked for, and only then', async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => { root = create(<HomeListHeader showTester lastSearch={null} />); });
    expect(root.root.findAll((n) => (n.type as unknown) === 'TesterProgress')).toHaveLength(1);
    await act(async () => { root.update(<HomeListHeader showTester={false} lastSearch={null} />); });
    expect(root.root.findAll((n) => (n.type as unknown) === 'TesterProgress')).toHaveLength(0);
  });

  it('no line before any search in this session', async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = create(<HomeListHeader showTester={false} lastSearch={null} />);
    });
    expect(has(root, 'search-summary')).toBe(false);
  });

  it('the header keeps a place for the other status lines, below the summary', async () => {
    const { Text } = require('react-native');
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = create(
        <HomeListHeader showTester={false} lastSearch={{ matchesFound: 2, candidatesConsidered: 40 }}>
          <Text testID="other-line">Frissítve</Text>
        </HomeListHeader>,
      );
    });
    const json = textOf(root);
    expect(json.indexOf('Frissítve')).toBeGreaterThan(-1);
    expect(json.indexOf('40 nyitott')).toBeLessThan(json.indexOf('Frissítve'));
  });

  it('the empty state names how many open grants were weighed', async () => {
    jest.useFakeTimers();
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = create(
        <HomeEmptyState kind="none" onSearch={jest.fn()} onEditProfile={jest.fn()} lastSearch={{ matchesFound: 0, candidatesConsidered: 52 }} />,
      );
    });
    expect(textOf(root)).toContain('52 nyitott kiírást néztünk át.');
    await act(async () => {
      root.update(<HomeEmptyState kind="none" onSearch={jest.fn()} onEditProfile={jest.fn()} lastSearch={null} />);
    });
    expect(has(root, 'empty-none-looked')).toBe(false);
    // no "0 nyitott kiírást" line when the server weighed none
    await act(async () => {
      root.update(<HomeEmptyState kind="none" onSearch={jest.fn()} onEditProfile={jest.fn()} lastSearch={{ matchesFound: 0, candidatesConsidered: 0 }} />);
    });
    expect(has(root, 'empty-none-looked')).toBe(false);
    jest.useRealTimers();
  });
});

// Ellenőr #268: announceForAccessibility says nothing in a browser; a live region that is there from the start does.
describe('SearchAnnouncer', () => {
  const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  const realOS = Platform.OS;
  afterEach(() => setOS(realOS));

  it('on web: a polite live region, empty before a search, the summary after it', async () => {
    setOS('web');
    let root!: renderer.ReactTestRenderer;
    await act(async () => { root = create(<SearchAnnouncer result={null} />); });
    const region = () => root.root.findAll((n) => n.props.testID === 'search-announcer')[0];
    expect(region().props['aria-live']).toBe('polite');
    expect(textOf(root)).not.toContain('néztünk át');
    await act(async () => { root.update(<SearchAnnouncer result={{ matchesFound: 6, candidatesConsidered: 60 }} />); });
    expect(region().props['aria-live']).toBe('polite');
    expect(textOf(root)).toContain('60 nyitott kiírást néztünk át, 6 illik a cégedhez.');
  });

  it('on a phone it renders nothing (announceForAccessibility speaks there)', async () => {
    setOS('android');
    let root!: renderer.ReactTestRenderer;
    await act(async () => { root = create(<SearchAnnouncer result={{ matchesFound: 6, candidatesConsidered: 60 }} />); });
    expect(root.toJSON()).toBeNull();
  });
});

describe('AppearIn', () => {
  it('a failed reduce-motion query still shows the card (the fade runs)', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('no'));
    const timing = jest.spyOn(Animated, 'timing');
    await act(async () => { create(<AppearIn index={0}><></></AppearIn>); });
    await act(async () => { await Promise.resolve(); });
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1 }));
  });

  const opacityOf = (root: renderer.ReactTestRenderer) => {
    const view = root.root.findAll((n) => n.props.testID === 'appear-in')[0];
    const o = view.props.style.opacity as Animated.Value | number;
    return typeof o === 'number' ? o : (o as unknown as { __getValue: () => number }).__getValue();
  };

  it('with reduce motion on, the card is visible at once', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    let root!: renderer.ReactTestRenderer;
    await act(async () => { root = create(<AppearIn index={3}><></></AppearIn>); });
    await act(async () => { await Promise.resolve(); });
    expect(opacityOf(root)).toBe(1);
  });

  it('otherwise it starts hidden and fades in, later cards a step later', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const timing = jest.spyOn(Animated, 'timing');
    let root!: renderer.ReactTestRenderer;
    await act(async () => { root = create(<AppearIn index={2}><></></AppearIn>); });
    await act(async () => { await Promise.resolve(); });
    expect(opacityOf(root)).toBe(0);
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, delay: 2 * APPEAR_STEP_MS }));
    await act(async () => { root.update(<AppearIn index={40}><></></AppearIn>); });
    expect(timing).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ delay: APPEAR_MAX_STEPS * APPEAR_STEP_MS }));
  });
});
