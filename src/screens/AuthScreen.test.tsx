import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AuthScreen, PASSWORD_MIN_LENGTH } from './AuthScreen';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../lib/legalLinks';
import { supabase } from '../lib/supabase';
import { Alert, Linking } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  },
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
    });
    expect(component.toJSON()).toBeTruthy();
  });

  it('prevents sign in with invalid email', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
    });

    const textInputs = component.root.findAllByType(TextInput);
    act(() => {
      textInputs[0].props.onChangeText('invalidemail');
      textInputs[1].props.onChangeText('password123');
    });

    const actionBtn = component.root.findAllByType(Button).find(b => b.props.children === 'Bejelentkezés');

    await act(async () => {
      await actionBtn.props.onPress();
    });

    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Érvénytelen adat', 'Kérlek, valós e-mail címet adj meg.');
  });

  it('prevents sign in with short password', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
    });

    const textInputs = component.root.findAllByType(TextInput);
    act(() => {
      textInputs[0].props.onChangeText('test@example.com');
      textInputs[1].props.onChangeText('123');
    });

    const actionBtn = component.root.findAllByType(Button).find(b => b.props.children === 'Bejelentkezés');

    await act(async () => {
      await actionBtn.props.onPress();
    });

    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Érvénytelen adat', 'A jelszónak legalább 8 karakter hosszúnak kell lennie.');
  });

  it('handles signUp error correctly', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
    });

    const textInputs = component.root.findAllByType(TextInput);
    act(() => {
      textInputs[0].props.onChangeText('test@example.com');
      textInputs[1].props.onChangeText('password123');
    });

    const mockError = new Error('Invalid email');

    (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
      data: { session: null },
      error: mockError,
    });

    const buttons = component.root.findAllByType(Button);
    const switchBtn = buttons.find(b => b.props.children === 'Nincs még fiókod? Regisztrálj!');

    await act(async () => {
      switchBtn.props.onPress();
    });

    const actionBtn = component.root.findAllByType(Button).find(b => b.props.children === 'Regisztráció');

    await act(async () => {
      await actionBtn.props.onPress();
    });

    expect(supabase.auth.signUp).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Hiba regisztrációkor', 'A regisztráció során hiba lépett fel. Kérlek, próbáld újra.');
  });

  it('handles successful signUp with null session (email confirmation required)', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
    });

    const textInputs = component.root.findAllByType(TextInput);
    act(() => {
      textInputs[0].props.onChangeText('test@example.com');
      textInputs[1].props.onChangeText('password123');
    });

    (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const buttons = component.root.findAllByType(Button);
    const switchBtn = buttons.find(b => b.props.children === 'Nincs még fiókod? Regisztrálj!');

    await act(async () => {
      switchBtn.props.onPress();
    });

    const actionBtn = component.root.findAllByType(Button).find(b => b.props.children === 'Regisztráció');

    await act(async () => {
      await actionBtn.props.onPress();
    });

    expect(supabase.auth.signUp).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Sikeres regisztráció!', 'Kérlek ellenőrizd az e-mail fiókodat a megerősítő linkért.');
  });

  it('tells an already registered e-mail to sign in instead of waiting for a mail', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
    });

    const textInputs = component.root.findAllByType(TextInput);
    act(() => {
      textInputs[0].props.onChangeText('existing@example.com');
      textInputs[1].props.onChangeText('password123');
    });

    // Supabase "user_repeated_signup": 200, session null, identities [] -- no mail is sent.
    (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
      data: { session: null, user: { id: 'u1', identities: [] } },
      error: null,
    });

    const switchBtn = component.root.findAllByType(Button).find(b => b.props.children === 'Nincs még fiókod? Regisztrálj!');
    await act(async () => {
      switchBtn.props.onPress();
    });
    const actionBtn = component.root.findAllByType(Button).find(b => b.props.children === 'Regisztráció');
    await act(async () => {
      await actionBtn.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('Ezzel az e-mail címmel már van fiók');
    expect(Alert.alert).not.toHaveBeenCalledWith('Sikeres regisztráció!', expect.anything());

    // The offered action switches the form back to login.
    await act(async () => {
      buttons[0].onPress();
    });
    expect(component.root.findAllByType(Button).find(b => b.props.children === 'Bejelentkezés')).toBeTruthy();
  });

  it('keeps the confirm-your-mail message for a genuinely new e-mail', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
    });

    const textInputs = component.root.findAllByType(TextInput);
    act(() => {
      textInputs[0].props.onChangeText('new@example.com');
      textInputs[1].props.onChangeText('password123');
    });

    // A real new sign-up carries the fresh identity; the confirmation mail IS sent.
    (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
      data: { session: null, user: { id: 'u2', identities: [{ id: 'i1', provider: 'email' }] } },
      error: null,
    });

    const switchBtn = component.root.findAllByType(Button).find(b => b.props.children === 'Nincs még fiókod? Regisztrálj!');
    await act(async () => {
      switchBtn.props.onPress();
    });
    const actionBtn = component.root.findAllByType(Button).find(b => b.props.children === 'Regisztráció');
    await act(async () => {
      await actionBtn.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith('Sikeres regisztráció!', 'Kérlek ellenőrizd az e-mail fiókodat a megerősítő linkért.');
    expect(Alert.alert).not.toHaveBeenCalledWith('Ezzel az e-mail címmel már van fiók', expect.anything(), expect.anything());
  });

  it('forgot password: needs a valid e-mail, then asks Supabase with the reset-page redirect', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
    });
    const forgot = () => component.root.findAllByType(Button).find(b => b.props.children === 'Elfelejtett jelszó?');
    expect(forgot()).toBeDefined();

    // empty e-mail: no request
    await act(async () => { await forgot().props.onPress(); });
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();

    const textInputs = component.root.findAllByType(TextInput);
    act(() => { textInputs[0].props.onChangeText('user@example.com'); });
    (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValueOnce({ data: {}, error: null });
    await act(async () => { await forgot().props.onPress(); });
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'https://p-search-mobil.vercel.app/reset-password',
    });
    expect(Alert.alert).toHaveBeenCalledWith('Ellenőrizd az e-mailed', expect.stringContaining('Ha van ilyen fiók'));
  });

  it('forgot password: a rate-limit error gets its own message', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
    });
    const textInputs = component.root.findAllByType(TextInput);
    act(() => { textInputs[0].props.onChangeText('user@example.com'); });
    (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValueOnce({ data: null, error: { message: 'email rate limit exceeded' } });
    const forgot = component.root.findAllByType(Button).find(b => b.props.children === 'Elfelejtett jelszó?');
    await act(async () => { await forgot.props.onPress(); });
    expect(Alert.alert).toHaveBeenCalledWith('Nem sikerült a kérés', expect.stringContaining('Túl sok kérés'));
  });

  it('forgot password button is hidden in sign-up mode', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
    });
    const switchBtn = component.root.findAllByType(Button).find(b => b.props.children === 'Nincs még fiókod? Regisztrálj!');
    await act(async () => { switchBtn.props.onPress(); });
    expect(component.root.findAllByType(Button).find(b => b.props.children === 'Elfelejtett jelszó?')).toBeUndefined();
  });

  it('handles successful signUp with session', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
    });

    const textInputs = component.root.findAllByType(TextInput);
    act(() => {
      textInputs[0].props.onChangeText('test@example.com');
      textInputs[1].props.onChangeText('password123');
    });

    (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
      data: { session: { user: { id: '123' } } },
      error: null,
    });

    const buttons = component.root.findAllByType(Button);
    const switchBtn = buttons.find(b => b.props.children === 'Nincs még fiókod? Regisztrálj!');

    await act(async () => {
      switchBtn.props.onPress();
    });

    const actionBtn = component.root.findAllByType(Button).find(b => b.props.children === 'Regisztráció');

    await act(async () => {
      await actionBtn.props.onPress();
    });

    expect(supabase.auth.signUp).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Sikeres regisztráció!');
  });

  // Round 3 (Lumen P1, 2026-11-03): mobile field types, a visible password rule, and the legal links at sign-up.
  describe('round 3 sign-up pack', () => {
    const render = () => {
      let c: any;
      act(() => { c = renderer.create(<AuthScreen />); });
      return c;
    };
    const toSignUp = (c: any) => {
      const sw = c.root.findAllByType(Button).find((b: any) => b.props.children === 'Nincs még fiókod? Regisztrálj!');
      act(() => { sw.props.onPress(); });
    };

    it('the e-mail field asks for the e-mail keyboard and autofill', () => {
      const c = render();
      const email = c.root.findByProps({ testID: 'auth-email' });
      expect(email.props).toMatchObject({ keyboardType: 'email-address', autoComplete: 'email', textContentType: 'emailAddress', autoCorrect: false });
    });

    it('the password field autofills the saved password at sign-in and suggests a new one at sign-up', () => {
      const c = render();
      expect(c.root.findByProps({ testID: 'auth-password' }).props).toMatchObject({ autoComplete: 'current-password', textContentType: 'password' });
      toSignUp(c);
      expect(c.root.findByProps({ testID: 'auth-password' }).props).toMatchObject({ autoComplete: 'new-password', textContentType: 'newPassword' });
    });

    it('the eye button shows and hides the password', () => {
      const c = render();
      expect(c.root.findByProps({ testID: 'auth-password' }).props.secureTextEntry).toBe(true);
      const eye = c.root.findAllByProps({ testID: 'auth-password-toggle' })[0];
      expect(eye.props.accessibilityLabel).toBe('Jelszó megjelenítése');
      act(() => { eye.props.onPress(); });
      expect(c.root.findByProps({ testID: 'auth-password' }).props.secureTextEntry).toBe(false);
      expect(c.root.findAllByProps({ testID: 'auth-password-toggle' })[0].props.accessibilityLabel).toBe('Jelszó elrejtése');
    });

    it('sign-up shows the password rule and the terms + privacy line; sign-in shows neither', () => {
      const c = render();
      expect(c.root.findAllByProps({ testID: 'auth-consent' })).toHaveLength(0);
      expect(c.root.findAllByProps({ testID: 'auth-password-rule' })).toHaveLength(0);
      toSignUp(c);
      expect(c.root.findAllByProps({ testID: 'auth-password-rule' })[0].props.children).toBe(`Legalább ${PASSWORD_MIN_LENGTH} karakter.`);
      const consent = c.root.findAllByProps({ testID: 'auth-consent' })[0];
      const text = (n: any): string => typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join('') : n?.props ? text(n.props.children) : '';
      expect(text(consent.props.children)).toBe('A regisztrációval elfogadod az ÁSZF-et és az Adatkezelési tájékoztatót.');
    });

    it('the two links open the terms and the privacy notice', () => {
      const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
      const c = render();
      toSignUp(c);
      act(() => { c.root.findAllByProps({ testID: 'auth-terms-link' })[0].props.onPress(); });
      act(() => { c.root.findAllByProps({ testID: 'auth-privacy-link' })[0].props.onPress(); });
      expect(open.mock.calls.map((x) => x[0])).toEqual([TERMS_URL, PRIVACY_POLICY_URL]);
      expect(c.root.findAllByProps({ testID: 'auth-terms-link' })[0].props.accessibilityRole).toBe('link');
      open.mockRestore();
    });
  });
});
