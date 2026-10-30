import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { OnboardingScreen } from '../OnboardingScreen';
import { supabase } from '../../lib/supabase';
import { TextInput, Button, HelperText } from 'react-native-paper';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { logger } from '../../utils/logger';
import { metasOutsideWhitelist, trackCalls } from '../../test-utils/events';

// Mock dependencies globally for all tests in this file
// Edge-to-edge insets (card bc8e4135): tests set mockInsets.bottom to measure the layout.
const mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => mockInsets,
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: jest.fn(),
    functions: {
        invoke: jest.fn(),
    },
  },
}));

jest.mock('../../components/AdBanner', () => ({
  AdBanner: () => null,
}));

// Card fa68ea84: the edit mode reads the existing profile from the context.
const mockProfileContext: { profile: Record<string, unknown> | null; refreshProfile: jest.Mock } = { profile: null, refreshProfile: jest.fn() };
jest.mock('../../context/ProfileContext', () => ({
  useProfile: () => mockProfileContext,
}));


jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));


describe('OnboardingScreen Form Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows error when company name is empty and save is clicked', async () => {
    const navigationMock = { replace: jest.fn() } as unknown as NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

    let root;
    act(() => {
      root = renderer.create(<OnboardingScreen navigation={navigationMock} />);
    });

    const button = root.root.findByProps({ children: 'Mentés és keresés indítása' });

    await act(async () => {
      await button.props.onPress();
    });

    const errorText = root.root.findByProps({ children: 'A cégnév megadása kötelező!' });
    expect(errorText).toBeTruthy();
  });
});

describe('OnboardingScreen Database Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display an error message if database insert fails', async () => {
    const mockNavigation = {
      replace: jest.fn(),
    } as unknown as NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

    const mockGetSession = jest.fn().mockResolvedValue({
      data: { session: { user: { id: 'test-user-id' } } },
    });
    (supabase.auth.getSession as jest.Mock) = mockGetSession;

    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: new Error('DB Error') });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
    (supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<OnboardingScreen navigation={mockNavigation} />);
    });

    const root = component!.root;

    const companyNameInput = root.findAllByType(TextInput).find(
      (node) => node.props.label === 'Cégnév *'
    );
    expect(companyNameInput).toBeTruthy();

    await act(async () => {
      companyNameInput!.props.onChangeText('Test Company');
    });

    const saveButton = root.find((n) => n.type === Button && n.props.testID === 'onboarding-save');
    expect(saveButton).toBeTruthy();

    await act(async () => {
      await saveButton.props.onPress();
    });

    const helperText = root.findByType(HelperText);
    expect(helperText.props.visible).toBe(true);
    expect(helperText.props.children).toBe('DB Error');

    expect(mockGetSession).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });
});


describe('OnboardingScreen Webhook Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.functions.invoke = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('navigates to Home even if webhook fails and logs warning', async () => {
    const mockNavigation = {
      replace: jest.fn(),
    } as unknown as NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

    const mockGetSession = jest.fn().mockResolvedValue({
      data: { session: { user: { id: 'test-user-id' } } },
    });
    (supabase.auth.getSession as jest.Mock) = mockGetSession;

    const mockSingle = jest.fn().mockResolvedValue({ data: { id: 'profile-id' }, error: null });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
    (supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert });

    const fetchError = new Error('Network error');
    (supabase.functions.invoke as jest.Mock).mockRejectedValueOnce(fetchError);

    let component;
    await act(async () => {
      component = renderer.create(<OnboardingScreen navigation={mockNavigation} />);
    });

    const root = component.root;

    const companyNameInput = root.findAllByType(TextInput).find(
      (node) => node.props.label === 'Cégnév *'
    );

    await act(async () => {
      companyNameInput.props.onChangeText('Test Company');
    });

    const saveButton = root.find((n) => n.type === Button && n.props.testID === 'onboarding-save');

    await act(async () => {
      await saveButton.props.onPress();
    });

    // Wait for the fire-and-forget fetch to settle
    await act(async () => {
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('trigger-n8n-webhook', {
      body: {
        business_id: 'profile-id',
        action: 'new_profile_created'
      }
    });

    expect(logger.warn).toHaveBeenCalledWith('Edge function hívás hiba:', fetchError);
    expect(mockNavigation.replace).toHaveBeenCalledWith('Home');
  });
});

// Card fa68ea84 (owner test 2026-10-15): a profile could be filled once and never corrected.
describe('OnboardingScreen edit mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileContext.profile = { id: 'profile-1', company_name: 'Régi Kft', tax_number: '12345678-2-41', industry_code: '6201', employee_count: 12, yearly_revenue: 180000000, goals: 'régi célok' };
    mockProfileContext.refreshProfile = jest.fn().mockResolvedValue(undefined);
  });

  it('prefills the form from the existing profile and UPDATES that row instead of inserting a new one', async () => {
    const mockNavigation = { replace: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) } as unknown as NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;
    (supabase.auth.getSession as jest.Mock) = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } } });
    const mockEq = jest.fn().mockResolvedValue({ error: null });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    const mockInsert = jest.fn();
    (supabase.from as jest.Mock).mockReturnValue({ update: mockUpdate, insert: mockInsert });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<OnboardingScreen navigation={mockNavigation} route={{ key: 'o', name: 'Onboarding', params: { edit: true } } as any} />);
    });
    const root = component!.root;
    const companyNameInput = root.findAllByType(TextInput).find((node) => node.props.label === 'Cégnév *');
    expect(companyNameInput!.props.value).toBe('Régi Kft');
    await act(async () => { companyNameInput!.props.onChangeText('Javított Kft'); });
    const goalsInput = root.findAllByType(TextInput).find((node) => String(node.props.label).startsWith('Fejlesztési'));
    if (goalsInput) await act(async () => { goalsInput.props.onChangeText('új célok'); });

    await act(async () => { await root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.onPress(); });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ company_name: 'Javított Kft', industry_code: '6201', employee_count: 12, yearly_revenue: 180000000 });
    expect(mockEq).toHaveBeenCalledWith('id', 'profile-1');
    expect(mockProfileContext.refreshProfile).toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
    // Card [G2]: an edit is profile_updated, with yes/no flags only (no company data in the event).
    expect(trackCalls('profile_updated')).toEqual([['profile_updated', { has_goals: true, has_industry: true, has_revenue: true, has_employees: true, has_tax_number: true }]]);
    expect(trackCalls('onboarding_done')).toEqual([]);
    expect(JSON.stringify(trackCalls('profile_updated'))).not.toMatch(/Javított|6201|180000000/);
    expect(metasOutsideWhitelist()).toEqual([]);
    await act(async () => { component!.unmount(); });
  });

  it('without the edit param the form still creates a profile (insert), even when one exists', async () => {
    const mockNavigation = { replace: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) } as unknown as NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;
    (supabase.auth.getSession as jest.Mock) = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } } });
    const mockSingle = jest.fn().mockResolvedValue({ data: { id: 'new-profile' }, error: null });
    const mockInsert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: mockSingle }) });
    const mockUpdate = jest.fn();
    (supabase.from as jest.Mock).mockReturnValue({ update: mockUpdate, insert: mockInsert });
    supabase.functions.invoke = jest.fn().mockResolvedValue({});
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderer.create(<OnboardingScreen navigation={mockNavigation} />); });
    const root = component!.root;
    const companyNameInput = root.findAllByType(TextInput).find((node) => node.props.label === 'Cégnév *');
    await act(async () => { companyNameInput!.props.onChangeText('Új Kft'); });
    await act(async () => { await root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.onPress(); });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledTimes(1);
    // Card [G2]: a new profile is onboarding_done, never profile_updated, and carries no company name.
    expect(trackCalls('onboarding_done')).toHaveLength(1);
    expect(trackCalls('profile_updated')).toEqual([]);
    expect(Object.keys(trackCalls('onboarding_done')[0][1]!).sort()).toEqual(['has_employees', 'has_goals', 'has_industry', 'has_revenue', 'has_tax_number']);
    expect(JSON.stringify(trackCalls('onboarding_done'))).not.toContain('Új Kft');
    expect(metasOutsideWhitelist()).toEqual([]);
    await act(async () => { component!.unmount(); });
  });
});

// Live chat test 2026-10-25 (Marveen 4938): after a new profile the context kept the "no profile" it cached at
// login, and the Copilot sent business_profile_id: null for the rest of the session.
describe('OnboardingScreen new profile refreshes the context', () => {
  const renderAndSave = async (mockNavigation: NativeStackNavigationProp<RootStackParamList, 'Onboarding'>) => {
    (supabase.auth.getSession as jest.Mock) = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } } });
    const mockSingle = jest.fn().mockResolvedValue({ data: { id: 'new-profile' }, error: null });
    const mockInsert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: mockSingle }) });
    (supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert });
    supabase.functions.invoke = jest.fn().mockResolvedValue({});
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderer.create(<OnboardingScreen navigation={mockNavigation} />); });
    const root = component!.root;
    const companyNameInput = root.findAllByType(TextInput).find((node) => node.props.label === 'Cégnév *');
    await act(async () => { companyNameInput!.props.onChangeText('Új Kft'); });
    await act(async () => { await root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.onPress(); });
    await act(async () => { component!.unmount(); });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileContext.profile = null;
  });

  it('refreshes the profile context before it goes Home', async () => {
    mockProfileContext.refreshProfile = jest.fn().mockResolvedValue(undefined);
    const mockNavigation = { replace: jest.fn() } as unknown as NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;
    await renderAndSave(mockNavigation);
    expect(mockProfileContext.refreshProfile).toHaveBeenCalledTimes(1);
    expect(mockNavigation.replace).toHaveBeenCalledWith('Home');
    const refreshedAt = mockProfileContext.refreshProfile.mock.invocationCallOrder[0];
    const navigatedAt = (mockNavigation.replace as jest.Mock).mock.invocationCallOrder[0];
    expect(refreshedAt).toBeLessThan(navigatedAt);
  });

  it('still goes Home when the refresh fails', async () => {
    const refreshError = new Error('offline');
    mockProfileContext.refreshProfile = jest.fn().mockRejectedValue(refreshError);
    const mockNavigation = { replace: jest.fn() } as unknown as NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;
    await renderAndSave(mockNavigation);
    expect(mockNavigation.replace).toHaveBeenCalledWith('Home');
    expect(logger.warn).toHaveBeenCalledWith('Profil-frissítés hiba:', refreshError);
  });
});

describe('OnboardingScreen tax number format warning (owner GO, Telegram 10614)', () => {
  let mockInsert: jest.Mock;
  let component: renderer.ReactTestRenderer;

  const renderWithTaxNumber = async (taxNumber: string) => {
    (supabase.auth.getSession as jest.Mock) = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } } });
    const mockSingle = jest.fn().mockResolvedValue({ data: { id: 'new-profile' }, error: null });
    mockInsert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: mockSingle }) });
    (supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert });
    supabase.functions.invoke = jest.fn().mockResolvedValue({ data: { found: false } });
    const mockNavigation = { replace: jest.fn() } as unknown as NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;
    await act(async () => { component = renderer.create(<OnboardingScreen navigation={mockNavigation} />); });
    const inputs = component.root.findAllByType(TextInput);
    await act(async () => { inputs.find((n) => n.props.label === 'Cégnév *')!.props.onChangeText('Adó Kft'); });
    const taxInput = component.root.findAllByType(TextInput).find((n) => n.props.label === 'Adószám')!;
    await act(async () => { taxInput.props.onChangeText(taxNumber); });
    return mockNavigation;
  };
  const blurTaxField = async () => {
    const taxInput = component.root.findAllByType(TextInput).find((n) => n.props.label === 'Adószám')!;
    await act(async () => { taxInput.props.onBlur(); });
  };
  const warning = () => component.root.findAllByProps({ testID: 'onboarding-tax-warning' }).filter((n) => n.type === HelperText);
  const save = async () => { await act(async () => { await component.root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.onPress(); }); };

  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileContext.profile = null;
    mockProfileContext.refreshProfile = jest.fn().mockResolvedValue(undefined);
  });
  afterEach(async () => { await act(async () => { component.unmount(); }); });

  it('a wrong check digit warns once the field is left, and saving still goes through with the typed number', async () => {
    const mockNavigation = await renderWithTaxNumber('12345678-1-12');
    expect(warning()).toHaveLength(0); // not while typing
    await blurTaxField();
    expect(warning()).toHaveLength(1);
    expect(warning()[0].props.children).toMatch(/ellenőrző számjegy/);
    await save();
    expect(mockInsert).toHaveBeenCalledWith([expect.objectContaining({ tax_number: '12345678-1-12' })]);
    expect(mockNavigation.replace).toHaveBeenCalledWith('Home');
  });

  it('a malformed number pressed straight to save still saves', async () => {
    const mockNavigation = await renderWithTaxNumber('1234');
    await save();
    expect(mockInsert).toHaveBeenCalledWith([expect.objectContaining({ tax_number: '1234' })]);
    expect(mockNavigation.replace).toHaveBeenCalledWith('Home');
  });

  it('a malformed number shows the shape hint', async () => {
    await renderWithTaxNumber('HU12345676');
    await blurTaxField();
    expect(warning()[0].props.children).toMatch(/formája: 12345678-1-12/);
  });

  it('fixing the number clears the warning', async () => {
    await renderWithTaxNumber('12345678-1-12');
    await blurTaxField();
    expect(warning()).toHaveLength(1);
    const taxInput = component.root.findAllByType(TextInput).find((n) => n.props.label === 'Adószám')!;
    await act(async () => { taxInput.props.onChangeText('12345676-2-41'); });
    expect(warning()).toHaveLength(0);
  });

  it.each([['a correct number', '12345676-2-41'], ['an empty field', '']])('%s gives no warning and saves', async (_label, taxNumber) => {
    const mockNavigation = await renderWithTaxNumber(taxNumber);
    await blurTaxField();
    expect(warning()).toHaveLength(0);
    await save();
    expect(warning()).toHaveLength(0);
    expect(mockInsert).toHaveBeenCalledWith([expect.objectContaining({ tax_number: taxNumber })]);
    expect(mockNavigation.replace).toHaveBeenCalledWith('Home');
  });
});

// The edit save path (Settings -> Cégprofil szerkesztése) against a mocked Supabase client.
describe('OnboardingScreen edit save path', () => {
  const editRoute = { key: 'o', name: 'Onboarding', params: { edit: true } } as any;
  const nav = () => ({ replace: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) }) as unknown as NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;
  const input = (root: renderer.ReactTestInstance, label: string) => root.findAllByType(TextInput).find((n) => n.props.label === label)!;
  let component: renderer.ReactTestRenderer;

  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getSession as jest.Mock) = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } } });
    mockProfileContext.profile = { id: 'profile-1', company_name: 'Régi Kft', tax_number: '', industry_code: '6201', employee_count: 12, yearly_revenue: 180000000, goals: '' };
    mockProfileContext.refreshProfile = jest.fn().mockResolvedValue(undefined);
  });
  afterEach(async () => { await act(async () => { component.unmount(); }); });

  it('a failed update shows the error and stays on the form', async () => {
    // supabase-js's PostgrestError is an Error subclass.
    const mockEq = jest.fn().mockResolvedValue({ error: new Error('Hálózati hiba') });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as jest.Mock).mockReturnValue({ update: mockUpdate, insert: jest.fn() });
    const navigation = nav();
    await act(async () => { component = renderer.create(<OnboardingScreen navigation={navigation} route={editRoute} />); });
    await act(async () => { await component.root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.onPress(); });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(component.toJSON())).toContain('Hálózati hiba');
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(mockProfileContext.refreshProfile).not.toHaveBeenCalled();
  });

  it('validates like the onboarding: a bad revenue saves nothing', async () => {
    const mockUpdate = jest.fn();
    (supabase.from as jest.Mock).mockReturnValue({ update: mockUpdate, insert: jest.fn() });
    const navigation = nav();
    await act(async () => { component = renderer.create(<OnboardingScreen navigation={navigation} route={editRoute} />); });
    await act(async () => { input(component.root, 'Éves árbevétel (HUF)').props.onChangeText('sok'); });
    await act(async () => { await component.root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.onPress(); });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  // The stored row the screen loads itself when the context holds no profile (PR #249 review, Péter 11611).
  const STORED = { id: 'profile-1', user_id: 'test-user-id', company_name: 'Tárolt Kft', tax_number: '12345678-2-41', industry_code: '6201', employee_count: 12, yearly_revenue: 180000000, goals: 'gépbeszerzés' };
  function fallbackClient(lookup: { data: unknown; error: unknown } | (() => never)) {
    const maybeSingle = jest.fn().mockImplementation(() => (typeof lookup === 'function' ? lookup() : Promise.resolve(lookup)));
    const limit = jest.fn().mockReturnValue({ maybeSingle });
    const lookupEq = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ eq: lookupEq });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    const insert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: 'new-1' }, error: null }) }) });
    (supabase.from as jest.Mock).mockReturnValue({ select, update, insert });
    return { select, lookupEq, update, updateEq, insert };
  }
  const fieldValues = (root: renderer.ReactTestInstance) => Object.fromEntries(root.findAllByType(TextInput).map((n) => [n.props.label, n.props.value]));

  it('(a) the context has no profile: the form opens with the stored values, and renaming changes only the name in the update', async () => {
    mockProfileContext.profile = null;
    const c = fallbackClient({ data: STORED, error: null });
    const navigation = nav();
    await act(async () => { component = renderer.create(<OnboardingScreen navigation={navigation} route={editRoute} />); });
    expect(c.select).toHaveBeenCalledWith('*');
    expect(c.lookupEq).toHaveBeenCalledWith('user_id', 'test-user-id');
    expect(fieldValues(component.root)).toMatchObject({
      'Cégnév *': 'Tárolt Kft', 'Adószám': '12345678-2-41', 'Főtevékenység (TEÁOR)': '6201',
      'Alkalmazottak száma': '12', 'Éves árbevétel (HUF)': '180000000',
    });
    await act(async () => { input(component.root, 'Cégnév *').props.onChangeText('Javított Kft'); });
    await act(async () => { await component.root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.onPress(); });
    expect(c.insert).not.toHaveBeenCalled();
    expect(c.update).toHaveBeenCalledTimes(1);
    expect(c.update.mock.calls[0][0]).toEqual({
      company_name: 'Javított Kft', tax_number: '12345678-2-41', industry_code: '6201',
      employee_count: 12, yearly_revenue: 180000000, goals: 'gépbeszerzés',
    });
    expect(c.updateEq).toHaveBeenCalledWith('id', 'profile-1');
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('(b) the load fails: the error is on the form, the save is disabled, and a press writes nothing (0 update, 0 insert)', async () => {
    mockProfileContext.profile = null;
    const c = fallbackClient({ data: null, error: new Error('Keresési hiba') });
    const navigation = nav();
    await act(async () => { component = renderer.create(<OnboardingScreen navigation={navigation} route={editRoute} />); });
    expect(JSON.stringify(component.toJSON())).toContain('Keresési hiba');
    expect(component.root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.disabled).toBe(true);
    await act(async () => { input(component.root, 'Cégnév *').props.onChangeText('Üres űrlapról'); });
    await act(async () => { await component.root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.onPress(); });
    expect(c.update).not.toHaveBeenCalled();
    expect(c.insert).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(mockProfileContext.refreshProfile).not.toHaveBeenCalled();
  });

  it('(b2) the load has not finished: the save is disabled and a press writes nothing', async () => {
    mockProfileContext.profile = null;
    const c = fallbackClient(() => new Promise(() => {}) as never);
    const navigation = nav();
    await act(async () => { component = renderer.create(<OnboardingScreen navigation={navigation} route={editRoute} />); });
    expect(component.root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.disabled).toBe(true);
    await act(async () => { input(component.root, 'Cégnév *').props.onChangeText('Még tölt'); });
    await act(async () => { await component.root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.onPress(); });
    expect(c.update).not.toHaveBeenCalled();
    expect(c.insert).not.toHaveBeenCalled();
  });

  it('the user has no stored profile at all: the load finds nothing and the first save is an insert for them', async () => {
    mockProfileContext.profile = null;
    const c = fallbackClient({ data: null, error: null });
    (supabase.functions as unknown) = { invoke: jest.fn().mockResolvedValue({}) };
    const navigation = nav();
    await act(async () => { component = renderer.create(<OnboardingScreen navigation={navigation} route={editRoute} />); });
    expect(component.root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.disabled).toBe(false);
    await act(async () => { input(component.root, 'Cégnév *').props.onChangeText('Új Kft'); });
    await act(async () => { await component.root.find((n) => n.type === Button && n.props.testID === 'onboarding-save').props.onPress(); });
    expect(c.update).not.toHaveBeenCalled();
    expect(c.insert).toHaveBeenCalledTimes(1);
    expect(c.insert.mock.calls[0][0][0]).toMatchObject({ user_id: 'test-user-id', company_name: 'Új Kft' });
  });
});

// Round 2 (Lumen P2-3, P2-4): the editor opened from Settings had no way back but the system button, and
// its fields had no accessible name (the outlined label is only drawn).
describe('OnboardingScreen round 2: way back and field names', () => {
  const editRoute = { key: 'o', name: 'Onboarding', params: { edit: true } } as any;
  const nav = () => ({ replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) }) as unknown as NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;
  const byTestID = (c: renderer.ReactTestRenderer, id: string) => c.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string');

  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileContext.profile = { id: 'profile-1', company_name: 'Régi Kft', tax_number: '', industry_code: '6201', employee_count: 12, yearly_revenue: 180000000, goals: '' };
  });

  it('in edit mode the header arrow and Mégse both go back without saving', async () => {
    const navigation = nav();
    let c!: renderer.ReactTestRenderer;
    await act(async () => { c = renderer.create(<OnboardingScreen navigation={navigation} route={editRoute} />); });
    await act(async () => { byTestID(c, 'onboarding-back')[0].props.onPress(); });
    await act(async () => { byTestID(c, 'onboarding-cancel')[0].props.onPress(); });
    expect((navigation as any).goBack).toHaveBeenCalledTimes(2);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(byTestID(c, 'onboarding-back')[0].props.accessibilityLabel).toBe('Vissza a beállításokhoz');
  });

  it('the first-time form (no edit) has neither, the save is the only way on', async () => {
    mockProfileContext.profile = null;
    let c!: renderer.ReactTestRenderer;
    await act(async () => { c = renderer.create(<OnboardingScreen navigation={nav()} />); });
    expect(byTestID(c, 'onboarding-back')).toHaveLength(0);
    expect(byTestID(c, 'onboarding-cancel')).toHaveLength(0);
  });

  it('every field has an accessible name equal to its label', async () => {
    let c!: renderer.ReactTestRenderer;
    await act(async () => { c = renderer.create(<OnboardingScreen navigation={nav()} route={editRoute} />); });
    const inputs = c.root.findAllByType(TextInput);
    expect(inputs).toHaveLength(6);
    for (const i of inputs) {
      expect(i.props.accessibilityLabel).toBe(String(i.props.label).replace(' *', ''));
    }
  });
});
