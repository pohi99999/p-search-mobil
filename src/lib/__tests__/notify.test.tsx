import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, { act } from 'react-test-renderer';
import { Alert, Platform } from 'react-native';
import { Button, Provider as PaperProvider } from 'react-native-paper';
import { notify, resetNoticesForTest, subscribeNotices } from '../notify';
import { WebNotifier } from '../../components/WebNotifier';
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
    expect(shown(c)).toEqual({ title: 'Érvénytelen adat', message: 'Kérlek, töltsd ki az összes mezőt.' });
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
