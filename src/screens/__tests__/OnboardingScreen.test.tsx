import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { OnboardingScreen } from '../OnboardingScreen';
import { supabase } from '../../lib/supabase';
import { TextInput, Button, HelperText } from 'react-native-paper';

// Mock dependencies globally for all tests in this file
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: jest.fn(),
  },
}));

jest.mock('../../components/AdBanner', () => ({
  AdBanner: () => null,
}));


jest.mock('../../config/constants', () => ({
  N8N_WEBHOOK_URL: 'https://mock-webhook.url',
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

import { logger } from '../../utils/logger';

describe('OnboardingScreen Form Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows error when company name is empty and save is clicked', async () => {
    const navigationMock = { replace: jest.fn() } as any;

    let root;
    act(() => {
      root = renderer.create(<OnboardingScreen navigation={navigationMock} />);
    });

    const button = root.root.findByProps({ children: 'Mentés és Keresés Indítása' });

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
    } as any;

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
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('navigates to Home even if webhook fails and logs warning', async () => {
    const mockNavigation = {
      replace: jest.fn(),
    } as any;

    const mockGetSession = jest.fn().mockResolvedValue({
      data: { session: { user: { id: 'test-user-id' } } },
    });
    (supabase.auth.getSession as jest.Mock) = mockGetSession;

    const mockSingle = jest.fn().mockResolvedValue({ data: { id: 'profile-id' }, error: null });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
    (supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert });

    const fetchError = new Error('Network error');
    (global.fetch as jest.Mock).mockRejectedValueOnce(fetchError);

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

    expect(global.fetch).toHaveBeenCalledWith('https://mock-webhook.url', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        business_id: 'profile-id',
        user_id: 'test-user-id',
        action: 'new_profile_created'
      })
    }));

    expect(logger.warn).toHaveBeenCalledWith('Webhook hívás hiba:', fetchError);
    expect(mockNavigation.replace).toHaveBeenCalledWith('Home');
  });
});
