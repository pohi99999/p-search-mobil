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

    const saveButton = root.findByType(Button);
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

    const saveButton = root.findByType(Button);

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

    await act(async () => { await root.findByType(Button).props.onPress(); });

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
    await act(async () => { await root.findByType(Button).props.onPress(); });
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
