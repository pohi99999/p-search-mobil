import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AuthScreen } from './AuthScreen';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import { Button } from 'react-native-paper';

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

  it('handles signUp error correctly', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
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
    expect(Alert.alert).toHaveBeenCalledWith('Hiba regisztrációkor', 'Váratlan hiba történt a regisztráció során.');
  });

  it('handles successful signUp with null session (email confirmation required)', async () => {
    let component;
    act(() => {
      component = renderer.create(<AuthScreen />);
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
