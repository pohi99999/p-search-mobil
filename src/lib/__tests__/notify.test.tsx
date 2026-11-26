import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, { act } from 'react-test-renderer';
import { Alert, Platform } from 'react-native';
import { Button, Modal, Provider as PaperProvider } from 'react-native-paper';
import { notify, resetNoticesForTest, subscribeNotices } from '../notify';
import { NOTICE_BACKDROP_LABEL, NOTICE_DIALOG_ID, NOTICE_MESSAGE_ID, NOTICE_TITLE_ID, WebNotifier, trapTab } from '../../components/WebNotifier';
import { AuthScreen } from '../../screens/AuthScreen';

jest.mock('../supabase', () => ({
  supabase: { auth: { signInWithPassword: jest.fn(), signUp: jest.fn(), resetPasswordForEmail: jest.fn() } },
}));

// react-native-web's Alert.alert shows nothing: in these tests it is a silent spy, like on the web.
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
const originalOS = Platform.OS;

const text = (n: any): string =>
  typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join('') : n?.props ? text(n.props.children) : '';

function shown(c: renderer.ReactTestRenderer) {
  const title = c.root.findAll((n) => n.props.testID === 'web-notice-title' && typeof n.type !== 'string')[0];
  const message = c.root.findAll((n) => n.props.testID === 'web-notice-message' && typeof n.type !== 'string')[0];
  return { title: title ? text(title.props.children) : null, message: message ? text(message.props.children) : null };
}

describe('notify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetNoticesForTest();
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('native: passes straight to Alert.alert, buttons included, and queues nothing', () => {
    Platform.OS = 'android';
    const buttons = [{ text: 'Bezár', style: 'cancel' as const }];
    const seen: number[] = [];
    const off = subscribeNotices((q) => seen.push(q.length));
    notify('Hiba', 'Valami', buttons);
    off();
    expect(alertSpy).toHaveBeenCalledWith('Hiba', 'Valami', buttons);
    expect(seen).toEqual([0]);
  });

  it('native: passes the fourth argument (options) through as well, and adds none when it is absent', () => {
    Platform.OS = 'ios';
    const options = { cancelable: true, onDismiss: jest.fn() };
    notify('Hiba', 'Valami', [{ text: 'Bezár' }], options);
    expect(alertSpy).toHaveBeenLastCalledWith('Hiba', 'Valami', [{ text: 'Bezár' }], options);
    expect(alertSpy.mock.calls[0]).toHaveLength(4);
    notify('Csak cím');
    expect(alertSpy.mock.calls[1]).toEqual(['Csak cím']);
  });

  it('web: queues the message instead of the silent Alert.alert, with a default button', () => {
    Platform.OS = 'web';
    let last: readonly { title: string; message?: string; buttons: { text?: string }[] }[] = [];
    const off = subscribeNotices((q) => { last = q; });
    notify('Hiba', 'Nem sikerült lefuttatni a keresést.');
    off();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(last).toHaveLength(1);
    expect(last[0].title).toBe('Hiba');
    expect(last[0].buttons.map((b) => b.text)).toEqual(['Rendben']);
  });

  it('web: the dialog shows the message; a button closes it and runs its handler; the next one follows', async () => {
    Platform.OS = 'web';
    const onPress = jest.fn();
    let c!: renderer.ReactTestRenderer;
    act(() => {
      c = renderer.create(
        <PaperProvider>
          <WebNotifier />
        </PaperProvider>,
      );
    });
    act(() => {
      notify('Napi keresési limit', 'Elérted a napi ingyenes keresést.', [
        { text: 'Bezár', style: 'cancel' },
        { text: 'Pro-ra váltok', onPress },
      ]);
      notify('Második', 'A második üzenet.');
    });
    expect(shown(c)).toEqual({ title: 'Napi keresési limit', message: 'Elérted a napi ingyenes keresést.' });
    const pro = c.root.findAllByType(Button).find((b) => text(b.props.children) === 'Pro-ra váltok')!;
    act(() => pro.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(shown(c)).toEqual({ title: 'Második', message: 'A második üzenet.' });
    act(() => c.unmount());
  });

  it('web: the backdrop is named in Hungarian, not Paper\'s "Close modal" (round 6, Kenshin 9154)', () => {
    Platform.OS = 'web';
    let c!: renderer.ReactTestRenderer;
    act(() => {
      c = renderer.create(
        <PaperProvider>
          <WebNotifier />
        </PaperProvider>,
      );
    });
    act(() => notify('Hiba bejelentkezéskor', 'Érvénytelen e-mail cím vagy jelszó.'));
    const modal = c.root.findAllByType(Modal)[0];
    expect(modal.props.overlayAccessibilityLabel).toBe(NOTICE_BACKDROP_LABEL);
    expect(NOTICE_BACKDROP_LABEL).toBe('Értesítés bezárása');
    const labels = c.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel);
    expect(labels).toContain('Értesítés bezárása');
    expect(labels).not.toContain('Close modal');
    act(() => c.unmount());
  });

  it('web: the notice is a modal dialog, named by its title and described by its message (round 6 follow-up)', () => {
    Platform.OS = 'web';
    let c!: renderer.ReactTestRenderer;
    act(() => {
      c = renderer.create(
        <PaperProvider>
          <WebNotifier />
        </PaperProvider>,
      );
    });
    const dialog = () => c.root.findAll((n) => n.props.testID === 'web-notice-dialog')[0];
    const withId = (id: string) => c.root.findAll((n) => n.props.nativeID === id && typeof n.type !== 'string')[0];
    act(() => notify('Hiba bejelentkezéskor', 'Érvénytelen e-mail cím vagy jelszó.'));
    expect(dialog().props.role).toBe('dialog');
    expect(dialog().props['aria-modal']).toBe(true);
    expect(dialog().props['aria-labelledby']).toBe(NOTICE_TITLE_ID);
    expect(dialog().props['aria-describedby']).toBe(NOTICE_MESSAGE_ID);
    // The ids the dialog points at are on the title and on the message, not on anything else.
    expect(text(withId(NOTICE_TITLE_ID).props.children)).toBe('Hiba bejelentkezéskor');
    expect(text(withId(NOTICE_MESSAGE_ID).props.children)).toBe('Érvénytelen e-mail cím vagy jelszó.');
    act(() => c.unmount());
  });

  it('web: Esc closes the notice, other keys do not, and the listener goes away with it', () => {
    Platform.OS = 'web';
    const handlers: ((e: { key: string }) => void)[] = [];
    const removed: unknown[] = [];
    (global as any).document = {
      addEventListener: jest.fn((type: string, h: (e: { key: string }) => void) => { if (type === 'keydown') handlers.push(h); }),
      removeEventListener: jest.fn((type: string, h: unknown) => { if (type === 'keydown') removed.push(h); }),
    };
    try {
      let c!: renderer.ReactTestRenderer;
      act(() => {
        c = renderer.create(
          <PaperProvider>
            <WebNotifier />
          </PaperProvider>,
        );
      });
      const shownNow = () => shown(c).title;
      act(() => notify('Hiba bejelentkezéskor', 'Érvénytelen e-mail cím vagy jelszó.'));
      expect(shownNow()).toBe('Hiba bejelentkezéskor');
      expect(handlers).toHaveLength(1);
      act(() => handlers[0]({ key: 'Enter' }));
      expect(shownNow()).toBe('Hiba bejelentkezéskor');
      act(() => handlers[0]({ key: 'Escape' }));
      expect(shownNow()).toBeNull();
      expect(removed).toContain(handlers[0]);
      act(() => c.unmount());
    } finally {
      delete (global as any).document;
    }
  });

  // Round 6 follow-up (Ellenőr 9301): the focus enters the notice, Tab stays inside, the focus goes back on close.
  it('trapTab: from outside to the first (Shift: the last), around at both ends, the browser moves it in between', () => {
    const items = ['a', 'b', 'c'];
    expect(trapTab(items, null, false)).toBe('a');
    expect(trapTab(items, 'x', false)).toBe('a');
    expect(trapTab(items, 'x', true)).toBe('c');
    expect(trapTab(items, 'c', false)).toBe('a');
    expect(trapTab(items, 'a', true)).toBe('c');
    expect(trapTab(items, 'a', false)).toBeNull();
    expect(trapTab(items, 'b', true)).toBeNull();
    expect(trapTab([], 'a', false)).toBeNull();
  });

  it('web: the notice takes the focus, wraps Tab inside, and gives the focus back when it closes', () => {
    Platform.OS = 'web';
    const handlers: ((e: { key: string; shiftKey?: boolean; preventDefault: () => void }) => void)[] = [];
    const page = { focus: jest.fn() };
    const first = { focus: jest.fn() };
    const last = { focus: jest.fn() };
    const doc: any = {
      activeElement: page,
      contains: () => true,
      getElementById: (id: string) => (id === NOTICE_DIALOG_ID ? { querySelectorAll: () => [first, last] } : null),
      addEventListener: jest.fn((type: string, h: any) => { if (type === 'keydown') handlers.push(h); }),
      removeEventListener: jest.fn(),
    };
    (global as any).document = doc;
    try {
      let c!: renderer.ReactTestRenderer;
      act(() => {
        c = renderer.create(
          <PaperProvider>
            <WebNotifier />
          </PaperProvider>,
        );
      });
      act(() => notify('Hiba bejelentkezéskor', 'Érvénytelen e-mail cím vagy jelszó.'));
      // opened: the focus goes to the first button
      expect(first.focus).toHaveBeenCalledTimes(1);
      // Tab on the last item wraps to the first; Shift+Tab on the first wraps to the last; in between the browser moves it
      const tab = (active: unknown, shiftKey = false) => {
        doc.activeElement = active;
        const preventDefault = jest.fn();
        act(() => handlers[handlers.length - 1]({ key: 'Tab', shiftKey, preventDefault }));
        return preventDefault;
      };
      expect(tab(last)).toHaveBeenCalled();
      expect(first.focus).toHaveBeenCalledTimes(2);
      expect(tab(first, true)).toHaveBeenCalled();
      expect(last.focus).toHaveBeenCalledTimes(1);
      expect(tab(first)).not.toHaveBeenCalled();
      // closed (Esc): the focus goes back to where it was before the notice
      act(() => handlers[handlers.length - 1]({ key: 'Escape', preventDefault: jest.fn() }));
      expect(shown(c).title).toBeNull();
      expect(page.focus).toHaveBeenCalledTimes(1);
      // the dialog element carries the id the focus handling looks for
      act(() => notify('Újra', 'Még egyszer.'));
      expect(c.root.findAll((n) => n.props.nativeID === NOTICE_DIALOG_ID && n.props.role === 'dialog').length).toBeGreaterThan(0);
      act(() => c.unmount());
    } finally {
      delete (global as any).document;
    }
  });

  it('web: when the focus had fallen to the body (a disabled button), it goes back to the last focused element', () => {
    Platform.OS = 'web';
    const keydown: any[] = [];
    const focusin: any[] = [];
    const body = { focus: jest.fn() };
    const signIn = { focus: jest.fn() };
    const button = { focus: jest.fn() };
    const doc: any = {
      body,
      activeElement: body,
      contains: () => true,
      getElementById: (id: string) => (id === NOTICE_DIALOG_ID ? { querySelectorAll: () => [button], contains: (el: unknown) => el === button } : null),
      addEventListener: jest.fn((type: string, h: any) => { if (type === 'keydown') keydown.push(h); if (type === 'focusin') focusin.push(h); }),
      removeEventListener: jest.fn(),
    };
    (global as any).document = doc;
    try {
      let c!: renderer.ReactTestRenderer;
      act(() => {
        c = renderer.create(
          <PaperProvider>
            <WebNotifier />
          </PaperProvider>,
        );
      });
      // the user was on the sign-in button; it got disabled and the focus fell to the body
      act(() => focusin[0]({ target: signIn }));
      doc.activeElement = body;
      act(() => notify('Hiba bejelentkezéskor', 'Érvénytelen e-mail cím vagy jelszó.'));
      expect(button.focus).toHaveBeenCalledTimes(1);
      // a focus inside the notice is not remembered as the place to go back to
      act(() => focusin[0]({ target: button }));
      act(() => keydown[keydown.length - 1]({ key: 'Escape', preventDefault: jest.fn() }));
      expect(signIn.focus).toHaveBeenCalledTimes(1);
      expect(body.focus).not.toHaveBeenCalled();
      // a second notice, the focus again on the body: it goes back to the sign-in button, not to the first notice's button
      doc.activeElement = body;
      act(() => notify('Hiba bejelentkezéskor', 'Még egyszer.'));
      act(() => keydown[keydown.length - 1]({ key: 'Escape', preventDefault: jest.fn() }));
      expect(signIn.focus).toHaveBeenCalledTimes(2);
      expect(button.focus).toHaveBeenCalledTimes(2); // once per opening, never as the place to go back to
      act(() => c.unmount());
    } finally {
      delete (global as any).document;
    }
  });

  it('web: the message is the dialog\'s description, not an alert of its own (no double announcement)', () => {
    Platform.OS = 'web';
    let c!: renderer.ReactTestRenderer;
    act(() => {
      c = renderer.create(
        <PaperProvider>
          <WebNotifier />
        </PaperProvider>,
      );
    });
    act(() => notify('Hiba', 'Valami.'));
    const message = c.root.findAll((n) => n.props.testID === 'web-notice-message')[0];
    expect(message.props.role).toBeUndefined();
    expect(message.props.accessibilityLiveRegion).toBeUndefined();
    expect(message.props.nativeID).toBe(NOTICE_MESSAGE_ID);
    act(() => c.unmount());
  });

  it('web: a notice with a title only is a dialog without a description', () => {
    Platform.OS = 'web';
    let c!: renderer.ReactTestRenderer;
    act(() => {
      c = renderer.create(
        <PaperProvider>
          <WebNotifier />
        </PaperProvider>,
      );
    });
    act(() => notify('Csak cím'));
    const dialog = c.root.findAll((n) => n.props.testID === 'web-notice-dialog')[0];
    expect(dialog.props.role).toBe('dialog');
    expect(dialog.props['aria-labelledby']).toBe(NOTICE_TITLE_ID);
    expect(dialog.props['aria-describedby']).toBeUndefined();
    act(() => c.unmount());
  });

  it('web: an empty sign-in shows its message on the screen (it was silent before)', async () => {
    Platform.OS = 'web';
    let c!: renderer.ReactTestRenderer;
    act(() => {
      c = renderer.create(
        <PaperProvider>
          <AuthScreen />
          <WebNotifier />
        </PaperProvider>,
      );
    });
    const login = c.root.findAllByType(Button).find((b) => text(b.props.children) === 'Bejelentkezés')!;
    await act(async () => { await login.props.onPress(); });
    // Round 6 (P1-4): on the screen, under each field; no dialog stands over the form any more.
    const errors = c.root.findAll((n) => typeof n.type !== 'string' && /^auth-(email|password)-error$/.test(n.props.testID ?? '')).map((n) => text(n.props.children));
    expect([...new Set(errors)]).toEqual(['Add meg az e-mail címed.', 'Add meg a jelszavad.']);
    expect(shown(c)).toEqual({ title: null, message: null });
    act(() => c.unmount());
  });

  it('no Alert.alert call is left in the app code: everything goes through notify()', () => {
    const root = path.join(__dirname, '..', '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name) || /\.test\.tsx?$/.test(e.name) || p.endsWith(path.join('lib', 'notify.ts'))) continue;
        const src = fs.readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '');
        if (/\bAlert\.alert\s*\(/.test(src)) offenders.push(path.relative(root, p));
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
