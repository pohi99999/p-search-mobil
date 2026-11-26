// The e-mail confirmation view (round 6): a pure view, wired by App.tsx. It says what happened, leads to the web
// sign-in, and shows the Google Play button only behind its switch. No promise of a time in its copy.
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Linking, Platform, StyleSheet } from 'react-native';
import { CONFIRMED_COPY, CONFIRMED_TAB_TITLE, EmailConfirmedView, PLAY_LISTING_URL } from '../EmailConfirmedView';

jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

const text = (n: any): string =>
  typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join('') : n?.props ? text(n.props.children) : '';

function mount(props: Partial<React.ComponentProps<typeof EmailConfirmedView>> = {}) {
  const onSignIn = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<EmailConfirmedView onSignIn={onSignIn} showPlayButton={false} {...props} />);
  });
  const byId = (id: string) => tree.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string')[0];
  return { tree, onSignIn, byId };
}

describe('EmailConfirmedView', () => {
  afterEach(() => jest.restoreAllMocks());

  it('says what happened: a level-1 heading and a status line', () => {
    const { tree, byId } = mount();
    const h = tree.root.findAll((n) => typeof n.type === 'string' && n.props.role === 'heading');
    expect(h.map((n) => [n.props['aria-level'], text(n.props.children)])).toEqual([[1, CONFIRMED_COPY.title]]);
    expect(text(byId('email-confirmed-lead').props.children)).toBe(CONFIRMED_COPY.lead);
    expect(byId('email-confirmed-lead').props.role).toBe('status');
    act(() => tree.unmount());
  });

  it('"Belépés a weben" runs onSignIn, and is a 48 px target', () => {
    const { tree, onSignIn, byId } = mount();
    const btn = byId('email-confirmed-sign-in');
    expect(text(btn.props.children)).toBe('Belépés a weben');
    expect(StyleSheet.flatten(btn.props.contentStyle).minHeight).toBeGreaterThanOrEqual(48);
    act(() => btn.props.onPress());
    expect(onSignIn).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('the Play button is hidden behind its switch, and shows with it', () => {
    const off = mount({ showPlayButton: false });
    expect(off.byId('email-confirmed-play')).toBeUndefined();
    expect(text(off.byId('email-confirmed-android').props.children)).toBe(CONFIRMED_COPY.androidLine);
    act(() => off.tree.unmount());
    const on = mount({ showPlayButton: true });
    expect(on.byId('email-confirmed-play')).toBeDefined();
    expect(text(on.byId('email-confirmed-play').props.children)).toBe(CONFIRMED_COPY.playButton);
    act(() => on.tree.unmount());
  });

  it('the Play button opens the listing of the app package', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const { tree, byId } = mount({ showPlayButton: true });
    // braces: onPress returns the openURL promise, and an un-awaited async act stops later effects from running
    act(() => {
      byId('email-confirmed-play').props.onPress();
    });
    expect(open).toHaveBeenCalledWith(PLAY_LISTING_URL);
    expect(PLAY_LISTING_URL).toContain('id=com.pohankaestarsa.psearch');
    act(() => tree.unmount());
  });

  // Round 6 follow-up (Kenshin 9267): the browser tab read only "P-Search" on this view.
  describe('the browser tab title (web)', () => {
    const originalOS = Platform.OS;
    afterEach(() => {
      Platform.OS = originalOS;
      delete (global as any).document;
    });

    it('names the tab while shown, and gives the old title back when it goes', () => {
      Platform.OS = 'web';
      (global as any).document = { title: 'P-Search' };
      const { tree } = mount();
      expect((global as any).document.title).toBe(CONFIRMED_TAB_TITLE);
      act(() => tree.unmount());
      expect((global as any).document.title).toBe('P-Search');
    });

    it('leaves a title alone that the navigator set meanwhile', () => {
      Platform.OS = 'web';
      (global as any).document = { title: 'P-Search' };
      const { tree } = mount();
      (global as any).document.title = 'Cégprofil | P-Search';
      act(() => tree.unmount());
      expect((global as any).document.title).toBe('Cégprofil | P-Search');
    });

    it('the title has the screens\' shape and no dash', () => {
      expect(CONFIRMED_TAB_TITLE).toMatch(/^[^|]+ \| P-Search$/);
      expect(CONFIRMED_TAB_TITLE).not.toMatch(/[\u2013\u2014]/);
    });

    it('native: nothing is touched', () => {
      Platform.OS = 'android';
      (global as any).document = { title: 'P-Search' };
      const { tree } = mount();
      expect((global as any).document.title).toBe('P-Search');
      act(() => tree.unmount());
    });
  });

  it('the copy promises no time and has no dash', () => {
    const all = Object.values(CONFIRMED_COPY).join(' ');
    expect(all).not.toMatch(/hamarosan|\bsoon\b|bientôt|prochainement|nemsokára|\bkésőbb\b/i);
    expect(all).not.toMatch(/[–—]/);
  });
});
