import { Alert } from 'react-native';
import React from 'react';
import renderer from 'react-test-renderer';
import { ActionPlanScreen } from '../../src/screens/ActionPlanScreen';
import { useActionPlan } from '../../src/hooks/useActionPlan';
import { supabase } from '../../src/lib/supabase';
import { useInterstitialAd } from '../../src/hooks/useInterstitialAd';

jest.mock('../../src/hooks/useActionPlan');

jest.mock('../../src/context/ProfileContext', () => ({
  useProfile: () => ({
    profile: { id: 'test-profile' },
    loading: false
  })
}));

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    from: jest.fn(),
    functions: {
      invoke: jest.fn(),
    }
  },
}));
jest.mock('../../src/hooks/useInterstitialAd', () => ({
  useInterstitialAd: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../src/utils/documentGenerator', () => ({
  generateAndSharePDF: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: any) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

// Mock react-native-google-mobile-ads
jest.mock('react-native-google-mobile-ads', () => ({
  InterstitialAd: {
    createForAdRequest: jest.fn(),
  },
  AdEventType: {
    LOADED: 'LOADED',
    CLOSED: 'CLOSED',
    ERROR: 'ERROR',
  },
}));

// Mock Surface to suppress overflow warning
jest.mock('react-native-paper', () => {
  const React = require('react');
  const { View } = require('react-native');
  const actualPaper = jest.requireActual('react-native-paper');
  return {
    ...actualPaper,
    Surface: ({ children, style }: any) => <View style={style}>{children}</View>,
  };
});

// Define global alert if it doesn't exist
if (typeof global.alert === 'undefined') {
  global.alert = jest.fn();
}

describe('ActionPlanScreen', () => {
  let mockAlert: jest.Mock;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'test-user' } } },
    });
    const mockSingle = jest.fn().mockResolvedValue({
      data: { id: 'test-profile' },
      error: null,
    });
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    (useInterstitialAd as jest.Mock).mockReturnValue({
      showAdIfAvailable: jest.fn((cb) => cb()),
    });
  });

  afterEach(() => {
    mockAlert.mockClear();
    jest.clearAllTimers();
  });

  it('shows an alert when updateTaskStatus fails', async () => {
    const mockUpdateTaskStatus = jest.fn().mockRejectedValue(new Error('Update failed'));

    const task = { id: 'task-1', plan_id: 'plan-1', status: 'todo', title: 'Task 1' };

    (useActionPlan as jest.Mock).mockReturnValue({
      plans: [{ id: 'plan-1', match_id: 'match-1', title: 'Plan 1', created_at: new Date().toISOString() }],
      tasks: { 'plan-1': [task] },
      loading: false,
      error: null,
      refetch: jest.fn(),
      updateTaskStatus: mockUpdateTaskStatus,
      generatePlanForMatch: jest.fn(),
    });

    const { SafeAreaProvider } = require('react-native-safe-area-context');
    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(
        <SafeAreaProvider>
          <ActionPlanScreen
            route={{ params: { matchId: 'match-1' } } as any}
            navigation={{ replace: jest.fn() } as any}
          />
        </SafeAreaProvider>
      );
    });

    const root = component!.root;

    // Find the Elkezd button which starts the task
    const button = root.find(el => el.props.children === 'Elkezd');

    await renderer.act(async () => {
      await button.props.onPress();
    });

    expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'plan-1', 'in_progress');
    expect(mockAlert).toHaveBeenCalledWith('Hiba', 'Nem sikerült frissíteni a feladat állapotát.');

    // Cleanup to prevent open handles/timers
    await renderer.act(async () => {
      component!.unmount();
    });
  });


  it('calls navigation.goBack when the back button is pressed', async () => {
    (useActionPlan as jest.Mock).mockReturnValue({
      plans: [],
      tasks: {},
      loading: false,
      error: null,
      refetch: jest.fn(),
      updateTaskStatus: jest.fn(),
      generatePlanForMatch: jest.fn(),
    });

    const mockGoBack = jest.fn();
    const { SafeAreaProvider } = require('react-native-safe-area-context');
    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(
        <SafeAreaProvider>
          <ActionPlanScreen
            route={{ params: { matchId: 'match-1' } } as any}
            navigation={{ replace: jest.fn(), goBack: mockGoBack } as any}
          />
        </SafeAreaProvider>
      );
    });

    const root = component!.root;
    const backButton = root.findByProps({ testID: 'action-plan-back-button' });

    await renderer.act(async () => {
      backButton.props.onPress();
    });

    expect(mockGoBack).toHaveBeenCalled();

    await renderer.act(async () => {
      component!.unmount();
    });
  });

  it('shows an error snackbar when generatePlanForMatch fails', async () => {
    const mockGeneratePlanForMatch = jest.fn().mockRejectedValue(new Error('Generation failed'));

    (useActionPlan as jest.Mock).mockReturnValue({
      plans: [],
      tasks: {},
      loading: false,
      error: null,
      refetch: jest.fn(),
      updateTaskStatus: jest.fn(),
      generatePlanForMatch: mockGeneratePlanForMatch,
    });

    const { SafeAreaProvider } = require('react-native-safe-area-context');
    let component: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      component = renderer.create(
        <SafeAreaProvider>
          <ActionPlanScreen
            route={{ params: { matchId: 'match-1' } } as any}
            navigation={{ replace: jest.fn() } as any}
          />
        </SafeAreaProvider>
      );
    });

    const root = component!.root;

    // Find the Generate button
    const generateButton = root.find(el =>
      el.props.children === 'Akcióterv Generálása'
    );

    await renderer.act(async () => {
      await generateButton.props.onPress();
    });

    expect(mockGeneratePlanForMatch).toHaveBeenCalledWith('test-profile', 'match-1');

    // Find Snackbar
    const snackbar = root.findByType(require('react-native-paper').Snackbar);
    expect(snackbar.props.visible).toBe(true);
    expect(snackbar.props.children).toBe('Hiba történt a generálás során. Kérjük, próbálja újra később.');

    await renderer.act(async () => {
      component!.unmount();
    });
  });
});
