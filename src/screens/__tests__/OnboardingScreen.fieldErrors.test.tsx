import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Button, TextInput } from 'react-native-paper';
import { OnboardingScreen, validateProfileForm } from '../OnboardingScreen';
import { supabase } from '../../lib/supabase';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    from: jest.fn(),
    functions: { invoke: jest.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));
jest.mock('../../components/AdBanner', () => ({ AdBanner: () => null }));
jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

// Field-level form errors (review P1-4, Péter 10518): "5 fő" used to give the generic
// "Hiba történt a mentés során." at the top of the form, naming no field.
const navigation = { replace: jest.fn(), navigate: jest.fn() } as any;
const input = (root: renderer.ReactTestInstance, label: string) => root.findAllByType(TextInput).find((n) => n.props.label === label)!;
const texts = (root: renderer.ReactTestInstance) =>
  root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children as string);

async function fillAndSave(values: Record<string, string>) {
  let c: renderer.ReactTestRenderer;
  act(() => { c = renderer.create(<OnboardingScreen navigation={navigation} />); });
  for (const [label, value] of Object.entries(values)) {
    await act(async () => { input(c!.root, label).props.onChangeText(value); });
  }
  await act(async () => { await c!.root.findByType(Button).props.onPress(); });
  return c!;
}

describe('OnboardingScreen field errors', () => {
  const insert = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    insert.mockReturnValue({ select: () => ({ single: jest.fn().mockResolvedValue({ data: { id: 'bp1' }, error: null }) }) });
    (supabase.from as jest.Mock).mockReturnValue({ insert });
  });

  it('a non-number employee count is reported at its field, marked red, and nothing is saved', async () => {
    const c = await fillAndSave({ 'Cégnév *': 'Teszt Kft.', 'Alkalmazottak száma': '5 fő' });
    const all = texts(c.root);
    expect(all).toContain('Csak számot írj, például 5.');
    expect(all).toContain('Javítsd a pirossal jelölt mezőt, és mentsd újra.');
    expect(all).not.toContain('Hiba történt a mentés során.');
    expect(input(c.root, 'Alkalmazottak száma').props.error).toBe(true);
    expect(input(c.root, 'Éves árbevétel (HUF)').props.error).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('typing into the field clears its error', async () => {
    const c = await fillAndSave({ 'Cégnév *': 'Teszt Kft.', 'Éves árbevétel (HUF)': '50 millió' });
    expect(texts(c.root)).toContain('Csak számot írj forintban, például 50000000.');
    await act(async () => { input(c.root, 'Éves árbevétel (HUF)').props.onChangeText('50000000'); });
    expect(texts(c.root)).not.toContain('Csak számot írj forintban, például 50000000.');
    expect(input(c.root, 'Éves árbevétel (HUF)').props.error).toBe(false);
  });

  it('spaces in the numbers are accepted and saved as a number', async () => {
    await fillAndSave({ 'Cégnév *': 'Teszt Kft.', 'Alkalmazottak száma': '12', 'Éves árbevétel (HUF)': '50 000 000' });
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({ employee_count: 12, yearly_revenue: 50000000 })]);
  });
});

describe('validateProfileForm', () => {
  it('returns one message per wrong field', () => {
    expect(validateProfileForm('', '', '')).toEqual({ company_name: 'A cégnév megadása kötelező!' });
    expect(validateProfileForm('  ', '5', '')).toEqual({ company_name: 'A cégnév megadása kötelező!' });
    expect(validateProfileForm('X', '5,5', 'sok')).toEqual({
      employee_count: 'Csak számot írj, például 5.',
      yearly_revenue: 'Csak számot írj forintban, például 50000000.',
    });
    expect(validateProfileForm('X', '5', '50000000')).toEqual({});
  });
});
