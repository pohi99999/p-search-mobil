import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { OnboardingScreen } from '../OnboardingScreen';

// Mock dependencies
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

describe('OnboardingScreen', () => {
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
