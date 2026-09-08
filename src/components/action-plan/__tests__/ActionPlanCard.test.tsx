import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import { ActionPlanCard } from '../ActionPlanCard';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../utils/logger';
import { generateAndSharePDF } from '../../../utils/documentGenerator';
import { ActionPlan, BusinessProfile } from '../../../types/database';

// Mock dependencies
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('../../../utils/documentGenerator', () => ({
  generateAndSharePDF: jest.fn(),
}));

jest.mock('../TaskItem', () => {
  const React = require('react');
  return {
    TaskItem: (props: any) => React.createElement('TaskItem', props)
  };
});

jest.mock('react-native-paper', () => {
  const React = require('react');
  const createMockComponent = (name: string) => {
    const Component = (props: any) => React.createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  };

  const Card = createMockComponent('Card') as any;
  Card.Content = createMockComponent('Card.Content');
  Card.Actions = createMockComponent('Card.Actions');

  const List = {
    Section: createMockComponent('List.Section')
  };

  return {
    Text: createMockComponent('Text'),
    Card,
    Button: createMockComponent('Button'),
    List,
    ProgressBar: createMockComponent('ProgressBar'),
    Divider: createMockComponent('Divider'),
  };
});

// Provide explicit mocks for react-native components without requireActual due to React 19 testing constraints in pure Node
jest.mock('react-native', () => {
  const React = require('react');
  const View = (props: any) => React.createElement('View', props, props.children);
  return {
    View,
    Alert: {
      alert: jest.fn(),
    },
    StyleSheet: {
      create: jest.fn((styles) => styles),
    },
  };
});

describe('ActionPlanCard PDF Generation', () => {
  const mockPlan: ActionPlan = {
    id: 'plan-123',
    title: 'Test Plan',
    created_at: '2024-01-01T00:00:00Z',
    match_id: 'match-123',
    ai_context: {},
    business_profile_id: 'profile-123',
  };

  const mockProfile: BusinessProfile = {
    id: 'profile-123',
    user_id: 'user-123',
    company_name: 'Test Corp',
    tax_number: '12345678-1-12',
    registration_number: '01-09-123456',
    address: 'Test Address',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    industry: null,
    employee_count: null,
    annual_revenue: null,
    founded_year: null,
    website: null,
    description: null,
    setup_completed: true,
  };

  const defaultProps = {
    plan: mockPlan,
    planTasks: [],
    planStats: {
      'plan-123': { totalTasks: 1, completedTasks: 0, progress: 0, percentage: 0 },
    },
    handleStatusChange: jest.fn(),
    profile: mockProfile,
    pdfLoading: false,
    setPdfLoading: jest.fn(),
    showAdIfAvailable: jest.fn((callback) => callback()),
    refetch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const getPdfButton = (root: renderer.ReactTestRenderer) => {
    const buttons = root.root.findAllByType('Button');
    return buttons.find(b => b.props.icon === 'file-pdf-box');
  };

  it('handles successful PDF generation', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { html: '<div>Mock PDF</div>' },
      error: null,
    });

    (generateAndSharePDF as jest.Mock).mockResolvedValue(undefined);

    let root: renderer.ReactTestRenderer | undefined;

    await act(async () => {
      root = renderer.create(<ActionPlanCard {...defaultProps} />);
    });

    const pdfButton = getPdfButton(root!);

    await act(async () => {
      await pdfButton?.props.onPress();
    });

    expect(defaultProps.setPdfLoading).toHaveBeenCalledWith(true);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('generate-document', {
      body: { business_profile_id: mockProfile.id, match_id: mockPlan.match_id }
    });
    expect(generateAndSharePDF).toHaveBeenCalledWith('<div>Mock PDF</div>', 'Test_Plan_uzleti_terv.pdf');
    expect(defaultProps.refetch).toHaveBeenCalled();
    expect(defaultProps.setPdfLoading).toHaveBeenCalledWith(false);
  });

  it('handles error returned directly from supabase.functions.invoke', async () => {
    const mockError = new Error('Supabase function failed');
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: mockError,
    });

    let root: renderer.ReactTestRenderer | undefined;

    await act(async () => {
      root = renderer.create(<ActionPlanCard {...defaultProps} />);
    });

    const pdfButton = getPdfButton(root!);

    await act(async () => {
      await pdfButton?.props.onPress();
    });

    expect(logger.error).toHaveBeenCalledWith('PDF generation error:', mockError);
    expect(Alert.alert).toHaveBeenCalledWith('Hiba', 'Váratlan hiba történt a PDF generálásakor. Kérjük, próbálja újra később.');
    expect(defaultProps.setPdfLoading).toHaveBeenCalledWith(false);
    expect(generateAndSharePDF).not.toHaveBeenCalled();
  });

  it('handles error inside data returned from supabase.functions.invoke', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { error: 'Internal generation error' },
      error: null,
    });

    let root: renderer.ReactTestRenderer | undefined;

    await act(async () => {
      root = renderer.create(<ActionPlanCard {...defaultProps} />);
    });

    const pdfButton = getPdfButton(root!);

    await act(async () => {
      await pdfButton?.props.onPress();
    });

    expect(logger.error).toHaveBeenCalledWith('PDF generation error:', expect.any(Error));
    expect(Alert.alert).toHaveBeenCalledWith('Hiba', 'Váratlan hiba történt a PDF generálásakor. Kérjük, próbálja újra később.');
    expect(defaultProps.setPdfLoading).toHaveBeenCalledWith(false);
    expect(generateAndSharePDF).not.toHaveBeenCalled();
  });

  it('handles unexpected exceptions during generation', async () => {
    const mockException = new Error('Network error');
    (supabase.functions.invoke as jest.Mock).mockRejectedValue(mockException);

    let root: renderer.ReactTestRenderer | undefined;

    await act(async () => {
      root = renderer.create(<ActionPlanCard {...defaultProps} />);
    });

    const pdfButton = getPdfButton(root!);

    await act(async () => {
      await pdfButton?.props.onPress();
    });

    expect(logger.error).toHaveBeenCalledWith('PDF generation error:', mockException);
    expect(Alert.alert).toHaveBeenCalledWith('Hiba', 'Váratlan hiba történt a PDF generálásakor. Kérjük, próbálja újra később.');
    expect(defaultProps.setPdfLoading).toHaveBeenCalledWith(false);
  });

  it('shows alert if profile or match_id is missing', async () => {
    const propsWithoutMatchId = {
      ...defaultProps,
      plan: { ...mockPlan, match_id: undefined }
    };

    let root: renderer.ReactTestRenderer | undefined;

    await act(async () => {
      root = renderer.create(<ActionPlanCard {...propsWithoutMatchId} />);
    });

    const pdfButton = getPdfButton(root!);

    await act(async () => {
      await pdfButton?.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith('Hiba', 'Nem generálható dokumentum: hiányzó cégprofil vagy pályázati azonosító.');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});
