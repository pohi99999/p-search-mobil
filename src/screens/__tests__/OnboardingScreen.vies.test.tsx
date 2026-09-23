import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native-paper';
import { OnboardingScreen } from '../OnboardingScreen';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('../../components/AdBanner', () => ({ AdBanner: () => null }));
jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

const navigation = { replace: jest.fn(), navigate: jest.fn() } as any;
const input = (root: renderer.ReactTestInstance, label: string) => root.findAllByType(TextInput).find((n) => n.props.label === label)!;

describe('OnboardingScreen VIES pre-fill', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not call vies-check before 8 digits', async () => {
    let c: renderer.ReactTestRenderer;
    act(() => { c = renderer.create(<OnboardingScreen navigation={navigation} />); });
    await act(async () => { input(c!.root, 'Adószám').props.onChangeText('1077338'); });
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('pre-fills an EMPTY company name from a VIES hit and shows the hint, once per number', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { found: true, vat: 'HU10773381', name: 'MAGYAR TELEKOM NYRT', address: 'BUDAPEST' }, error: null });
    let c: renderer.ReactTestRenderer;
    act(() => { c = renderer.create(<OnboardingScreen navigation={navigation} />); });
    await act(async () => { input(c!.root, 'Adószám').props.onChangeText('10773381-2-44'); });
    await act(async () => { input(c!.root, 'Adószám').props.onBlur(); });
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('vies-check', { body: { tax_number: '10773381' } });
    expect(input(c!.root, 'Cégnév *').props.value).toBe('MAGYAR TELEKOM NYRT');
    expect(JSON.stringify(c!.toJSON())).toContain('VIES: MAGYAR TELEKOM NYRT, BUDAPEST');
  });

  it('leaves a typed company name alone and shows nothing on a miss', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { found: false, vat: 'HU12345678', name: null, address: null, reason: 'invalid' }, error: null });
    let c: renderer.ReactTestRenderer;
    act(() => { c = renderer.create(<OnboardingScreen navigation={navigation} />); });
    await act(async () => { input(c!.root, 'Cégnév *').props.onChangeText('Saját Kft'); });
    await act(async () => { input(c!.root, 'Adószám').props.onChangeText('12345678'); });
    expect(input(c!.root, 'Cégnév *').props.value).toBe('Saját Kft');
    expect(JSON.stringify(c!.toJSON())).not.toContain('VIES:');
  });

  it('a found name never overwrites a company name the user already typed', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { found: true, vat: 'HU10773381', name: 'MAGYAR TELEKOM NYRT', address: null }, error: null });
    let c: renderer.ReactTestRenderer;
    act(() => { c = renderer.create(<OnboardingScreen navigation={navigation} />); });
    await act(async () => { input(c!.root, 'Cégnév *').props.onChangeText('Saját Kft'); });
    await act(async () => { input(c!.root, 'Adószám').props.onChangeText('10773381'); });
    expect(input(c!.root, 'Cégnév *').props.value).toBe('Saját Kft');
  });
});
