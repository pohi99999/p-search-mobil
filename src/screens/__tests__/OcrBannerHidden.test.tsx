// P-Search round 6 (Kenshin, 2026-11-25): react-native-paper's Banner keeps its content mounted while visible=false
// (on web at opacity 0), so a screen reader announced "A dokumentum minősége nem megfelelő" and focused an invisible
// "Újra fotózom" button on the paywall, the action plan and the upload screen. This test renders the REAL Banner
// (the other screen tests mock it away), so the hidden banner text must not be in the tree at all.
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Button } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { DocumentUploadScreen } from '../DocumentUploadScreen';
import { PaywallScreen } from '../PaywallScreen';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../context/ProfileContext';
import { useBilling } from '../../context/BillingContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    base64: jest.fn().mockResolvedValue('native-base64'),
  })),
}));

jest.mock('../../context/ProfileContext', () => ({
  useProfile: jest.fn(),
}));

jest.mock('../../context/BillingContext', () => ({
  useBilling: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
  useRoute: jest.fn(() => ({ params: undefined })),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const BANNER_TEXT = 'A dokumentum minősége nem megfelelő';
const BANNER_ACTION = 'Újra fotózom';

const withSafeArea = (children: React.ReactNode) =>
  renderer.create(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      {children}
    </SafeAreaProvider>
  );

const uploadNavigation = () =>
  ({
    canGoBack: jest.fn().mockReturnValue(true),
    goBack: jest.fn(),
    navigate: jest.fn(),
  }) as unknown as NativeStackNavigationProp<RootStackParamList, 'DocumentUpload'>;

const renderUpload = () =>
  withSafeArea(<DocumentUploadScreen navigation={uploadNavigation()} route={{ key: 'u', name: 'DocumentUpload' }} />);

async function uploadWithConfidence(confidence: 'high' | 'low') {
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({
    data: {
      success: true,
      document_id: 'document-1',
      message: 'Sikeres feldolgozás',
      extracted_data: {
        net_revenue: 1000000,
        ebitda: 100000,
        equity: 200000,
        employee_count: 3,
        document_year: 2025,
        extraction_confidence: confidence,
        notes: '',
      },
    },
    error: null,
  });
  let component: renderer.ReactTestRenderer;
  await act(async () => {
    component = renderUpload();
  });
  const pick = component!.root
    .findAllByType(Button)
    .find((button) => button.props.children === 'Dokumentum kiválasztása');
  await act(async () => {
    await pick!.props.onPress();
  });
  return component!;
}

describe('the low-confidence OCR banner is not in the tree while hidden', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useProfile as jest.Mock).mockReturnValue({
      profile: { id: 'business-profile-1', company_name: 'Teszt Kft.' },
      loading: false,
      refreshProfile: jest.fn().mockResolvedValue(undefined),
    });
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://merleg.pdf', name: 'merleg.pdf', mimeType: 'application/pdf', base64: 'pdf-base64' }],
    });
    (useNavigation as jest.Mock).mockReturnValue({ goBack: jest.fn(), navigate: jest.fn() });
    (useBilling as jest.Mock).mockReturnValue({
      packages: [],
      purchasePackage: jest.fn(),
      restorePurchases: jest.fn(),
      isLoading: false,
      isPro: false,
    });
  });

  it('upload screen: no banner before any upload', async () => {
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderUpload();
    });
    const tree = JSON.stringify(component!.toJSON());
    expect(tree).not.toContain(BANNER_TEXT);
    expect(tree).not.toContain(BANNER_ACTION);
  });

  it('upload screen: no banner after a high-confidence upload', async () => {
    const component = await uploadWithConfidence('high');
    expect(JSON.stringify(component.toJSON())).not.toContain(BANNER_TEXT);
  });

  it('upload screen: the banner shows after a low-confidence upload, and its action hides it', async () => {
    const component = await uploadWithConfidence('low');
    expect(JSON.stringify(component.toJSON())).toContain(BANNER_TEXT);
    const action = component.root
      .findAllByType(Button)
      .find((button) => button.props.children === BANNER_ACTION);
    expect(action).toBeDefined();
    await act(async () => {
      action!.props.onPress();
    });
    expect(JSON.stringify(component.toJSON())).not.toContain(BANNER_TEXT);
  });

  it('paywall: never renders the OCR banner', async () => {
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = withSafeArea(<PaywallScreen />);
    });
    const tree = JSON.stringify(component!.toJSON());
    expect(tree).not.toContain(BANNER_TEXT);
    expect(tree).not.toContain(BANNER_ACTION);
  });
});
