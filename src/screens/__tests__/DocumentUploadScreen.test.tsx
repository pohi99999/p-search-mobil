import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Button } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { DocumentUploadScreen, DOCUMENT_TOO_LARGE_MESSAGE, MAX_DOCUMENT_BYTES } from '../DocumentUploadScreen';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../context/ProfileContext';
import { logger } from '../../utils/logger';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { metasOutsideWhitelist, trackCalls } from '../../test-utils/events';

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

jest.mock('../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('react-native-paper', () => {
  const React = require('react');
  const Actual = jest.requireActual('react-native-paper');
  return {
    ...Actual,
    Banner: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(Actual.Text, null, children) : null,
    Snackbar: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(Actual.Text, null, children) : null,
  };
});

const createNavigationMock = () =>
  ({
    canGoBack: jest.fn().mockReturnValue(true),
    goBack: jest.fn(),
    navigate: jest.fn(),
  }) as unknown as NativeStackNavigationProp<RootStackParamList, 'DocumentUpload'>;

const renderDocumentUploadScreen = () =>
  renderer.create(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 0, height: 0 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <DocumentUploadScreen
        navigation={createNavigationMock()}
        route={{ key: 'document-upload', name: 'DocumentUpload' }}
      />
    </SafeAreaProvider>
  );

describe('DocumentUploadScreen', () => {
  const refreshProfile = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    (useProfile as jest.Mock).mockReturnValue({
      profile: { id: 'business-profile-1', company_name: 'Teszt Kft.' },
      loading: false,
      refreshProfile,
    });
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://merleg.pdf',
          name: 'merleg.pdf',
          mimeType: 'application/pdf',
          base64: 'pdf-base64',
        },
      ],
    });
  });

  it('uploads a selected document and renders extracted values', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        document_id: 'document-1',
        message: 'Sikeres feldolgozás',
        extracted_data: {
          net_revenue: 12345678,
          ebitda: 2345678,
          equity: 3456789,
          employee_count: 12,
          document_year: 2025,
          extraction_confidence: 'high',
          notes: 'Teszt megjegyzés',
        },
      },
      error: null,
    });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderDocumentUploadScreen();
    });

    const uploadButton = component!.root.findAllByType(Button).find(
      (button) => button.props.children === 'Dokumentum kiválasztása'
    );

    await act(async () => {
      await uploadButton!.props.onPress();
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('process-master-document', {
      body: {
        business_profile_id: 'business-profile-1',
        file_base64: 'pdf-base64',
        mime_type: 'application/pdf',
        file_name: 'merleg.pdf',
      },
    });
    expect(refreshProfile).toHaveBeenCalled();

    const tree = JSON.stringify(component!.toJSON());
    expect(tree).toContain((12345678).toLocaleString('hu-HU'));
    expect(tree).toContain((2345678).toLocaleString('hu-HU'));
    expect(tree).toContain((3456789).toLocaleString('hu-HU'));
    expect(tree).toContain('2025');
    expect(tree).toContain('Magas');
    // Card [G2]
    expect(trackCalls('document_uploaded')).toEqual([['document_uploaded', { ok: true }]]);
    expect(metasOutsideWhitelist()).toEqual([]);
  });


  it('shows snackbar and prevents upload when profile is missing', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      profile: null,
      loading: false,
      refreshProfile,
    });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderDocumentUploadScreen();
    });

    const uploadButton = component!.root.findAllByType(Button).find(
      (button) => button.props.children === 'Dokumentum kiválasztása'
    );

    await act(async () => {
      await uploadButton!.props.onPress();
    });

    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();
    const tree = JSON.stringify(component!.toJSON());
    expect(tree).toContain('A dokumentum feltöltéséhez először töltsd ki a cégprofilt.');
  });

  it('shows generic feedback and logs details when upload fails', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: new Error('Edge function failed'),
    });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderDocumentUploadScreen();
    });

    const uploadButton = component!.root.findAllByType(Button).find(
      (button) => button.props.children === 'Dokumentum kiválasztása'
    );

    await act(async () => {
      await uploadButton!.props.onPress();
    });

    const tree = JSON.stringify(component!.toJSON());
    expect(tree).toContain('Nem sikerült feldolgozni a dokumentumot');
    expect(logger.error).toHaveBeenCalledWith(
      'DocumentUploadScreen feltöltési hiba:',
      'Edge function failed'
    );
    // Card [G2]
    expect(trackCalls('document_uploaded')).toEqual([['document_uploaded', { ok: false }]]);
  });

  // P-Search kör 2, P1-5: the 4th upload of the day shows the server's daily-cap text, not the generic failure.
  it('shows the daily-cap message of a 429 answer', async () => {
    const limitError = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: { status: 429, json: () => Promise.resolve({ success: false, error: 'Mára elérted a dokumentumfeltöltések keretét (napi 3). Holnap újra feltölthetsz.', code: 'ocr_daily_limit' }) },
    });
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: limitError });
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderDocumentUploadScreen(); });
    const uploadButton = component!.root.findAllByType(Button).find((button) => button.props.children === 'Dokumentum kiválasztása');
    await act(async () => { await uploadButton!.props.onPress(); });
    const tree = JSON.stringify(component!.toJSON());
    expect(tree).toContain('Mára elérted a dokumentumfeltöltések keretét (napi 3)');
    expect(tree).not.toContain('Nem sikerült feldolgozni a dokumentumot');
    expect(trackCalls('document_uploaded')).toEqual([['document_uploaded', { ok: false }]]);
  });

  it('a non-429 failure still shows the generic text', async () => {
    const other = Object.assign(new Error('boom'), { context: { status: 500, json: () => Promise.resolve({ error: 'belső' }) } });
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: other });
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderDocumentUploadScreen(); });
    const uploadButton = component!.root.findAllByType(Button).find((button) => button.props.children === 'Dokumentum kiválasztása');
    await act(async () => { await uploadButton!.props.onPress(); });
    expect(JSON.stringify(component!.toJSON())).toContain('Nem sikerült feldolgozni a dokumentumot');
  });

  it('shows snackbar for unsupported mime types', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file://document.txt',
          name: 'document.txt',
          mimeType: 'text/plain',
          base64: 'base-64',
        },
      ],
    });

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderDocumentUploadScreen();
    });

    const uploadButton = component!.root
      .findAllByType(Button)
      .find((button) => button.props.children === 'Dokumentum kiválasztása');

    await act(async () => {
      await uploadButton!.props.onPress();
    });

    const tree = JSON.stringify(component!.toJSON());
    expect(tree).toContain(
      'Nem támogatott fájltípus. PDF, JPEG, PNG vagy WebP dokumentumot tölts fel.'
    );
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  const pickAndUpload = async (size: number | undefined) => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://nagy.pdf', name: 'nagy.pdf', mimeType: 'application/pdf', base64: 'pdf-base64', size }],
    });
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({ data: null, error: new Error('nem várt hívás') });
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderDocumentUploadScreen();
    });
    const uploadButton = component!.root
      .findAllByType(Button)
      .find((button) => button.props.children === 'Dokumentum kiválasztása');
    await act(async () => {
      await uploadButton!.props.onPress();
    });
    return JSON.stringify(component!.toJSON());
  };

  it('refuses a document over the 10 MB cap with a specific message, without calling the function', async () => {
    const tree = await pickAndUpload(MAX_DOCUMENT_BYTES + 1);
    expect(tree).toContain(DOCUMENT_TOO_LARGE_MESSAGE);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('still uploads a document at the cap or with an unknown size', async () => {
    for (const size of [MAX_DOCUMENT_BYTES, undefined]) {
      jest.clearAllMocks();
      const tree = await pickAndUpload(size);
      expect(tree).not.toContain(DOCUMENT_TOO_LARGE_MESSAGE);
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    }
  });
});
