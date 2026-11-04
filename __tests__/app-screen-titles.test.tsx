// Review 2026-11-03, web: React Navigation names the browser tab after a screen's `options.title`, else its
// route name, so the sign-in tab read "Auth". Every screen App registers must carry a Hungarian title.
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SCREEN_TITLES } from '../src/config/screenTitles';

const mockGetSession = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));
jest.mock('react-native-google-mobile-ads', () => () => ({ initialize: () => Promise.resolve() }));
jest.mock('@sentry/react-native', () => ({ init: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ NavigationContainer: ({ children }: any) => children }));
// The stack renders each registered screen as a plain host element, so the test can read its props.
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: 'StackScreen',
  }),
}));
jest.mock('../src/context/BillingContext', () => ({ BillingProvider: ({ children }: any) => children }));
jest.mock('../src/context/ProfileContext', () => ({ ProfileProvider: ({ children }: any) => children }));
for (const name of ['Auth', 'Home', 'Onboarding', 'Paywall', 'ActionPlan', 'CopilotChat', 'Settings', 'DocumentUpload', 'GrantDetail']) {
  jest.doMock(`../src/screens/${name}Screen`, () => ({ [`${name}Screen`]: () => null }));
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const App = require('../App').default;

async function registeredScreens(session: unknown) {
  mockGetSession.mockResolvedValue({ data: { session } });
  let tree: any;
  await act(async () => { tree = renderer.create(<App />); });
  return tree.root.findAllByType('StackScreen').map((s: any) => ({ name: s.props.name, title: s.props.options?.title }));
}

describe('screen titles (web browser tab)', () => {
  it('the sign-in screen is "Belépés | P-Search", not "Auth"', async () => {
    expect(await registeredScreens(null)).toEqual([{ name: 'Auth', title: 'Belépés | P-Search' }]);
  });

  it('every signed-in screen has its own title from SCREEN_TITLES', async () => {
    const screens = await registeredScreens({ user: { id: 'u1' } });
    expect(screens.length).toBe(8);
    for (const { name, title } of screens) {
      expect(title).toBe(SCREEN_TITLES[name as keyof typeof SCREEN_TITLES]);
      expect(title).not.toBe(name);
    }
  });

  it('every title is Hungarian-style "<name> | P-Search" with no en or em dash', () => {
    for (const title of Object.values(SCREEN_TITLES)) {
      expect(title).toMatch(/^\S.* \| P-Search$/);
      expect(title).not.toMatch(/[–—]/);
    }
    expect(new Set(Object.values(SCREEN_TITLES)).size).toBe(Object.keys(SCREEN_TITLES).length);
  });
});
