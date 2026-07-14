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
