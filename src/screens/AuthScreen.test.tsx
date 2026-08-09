import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AuthScreen } from './AuthScreen';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
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
});
