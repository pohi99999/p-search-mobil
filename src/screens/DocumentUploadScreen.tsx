import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
  ActivityIndicator,
  Banner,
  Button,
  Card,
  IconButton,
  Snackbar,
  Text,
} from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { useProfile } from '../context/ProfileContext';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/error';
import type { DocumentUploadScreenProps } from '../types/navigation';

type ExtractionConfidence = 'high' | 'medium' | 'low';

type ExtractedFinancialData = {
  net_revenue: number | null;
  ebitda: number | null;
  equity: number | null;
  employee_count: number | null;
  document_year: number | null;
  extraction_confidence: ExtractionConfidence | null;
  notes: string | null;
};

type ProcessMasterDocumentResponse = {
  success: boolean;
  document_id: string | null;
  message: string;
  extracted_data: ExtractedFinancialData;
  error?: string;
};

const acceptedMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const inferMimeType = (fileName: string) => {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
};

const formatCurrency = (value: number | null) =>
  value === null ? 'Nem talált' : `${value.toLocaleString('hu-HU')} Ft`;

const formatNumber = (value: number | null) =>
  value === null ? 'Nem talált' : value.toLocaleString('hu-HU');

const formatConfidence = (value: ExtractionConfidence | null) => {
  switch (value) {
    case 'high':
      return 'Magas';
    case 'medium':
      return 'Közepes';
    case 'low':
      return 'Alacsony';
    default:
      return 'Nem ismert';
  }
};

export function DocumentUploadScreen({ navigation }: DocumentUploadScreenProps) {
  const { profile, loading: profileLoading, refreshProfile } = useProfile();
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedFinancialData | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [lowConfidenceVisible, setLowConfidenceVisible] = useState(false);

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const handlePickAndUpload = async () => {
    if (!profile?.id) {
      showSnackbar('A dokumentum feltöltéséhez először töltsd ki a cégprofilt.');
      return;
    }

    try {
      setStatusText('Dokumentum kiválasztása...');
      const result = await DocumentPicker.getDocumentAsync({
        type: acceptedMimeTypes,
        multiple: false,
        copyToCacheDirectory: true,
        base64: true,
      });

      if (result.canceled) {
        setStatusText('');
        return;
      }

      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? inferMimeType(asset.name);

      if (!acceptedMimeTypes.includes(mimeType)) {
        showSnackbar('Nem támogatott fájltípus. PDF, JPEG, PNG vagy WebP dokumentumot tölts fel.');
        setStatusText('');
        return;
      }

      setUploading(true);
      setSelectedFileName(asset.name);
      setStatusText('Dokumentum előkészítése...');

      const fileBase64 = asset.base64 ?? (await new File(asset.uri).base64());

      setStatusText('Gemini OCR feldolgozás folyamatban...');
      const { data, error } = await supabase.functions.invoke<ProcessMasterDocumentResponse>(
        'process-master-document',
        {
          body: {
            business_profile_id: profile.id,
            file_base64: fileBase64,
            mime_type: mimeType,
            file_name: asset.name,
          },
        }
      );

      if (error) throw error;
      if (!data || !data.success || data.error) {
        throw new Error(data?.error ?? 'A dokumentum feldolgozása sikertelen.');
      }

      setExtractedData(data.extracted_data);
      setLowConfidenceVisible(data.extracted_data.extraction_confidence === 'low');
      await refreshProfile();
      showSnackbar('Dokumentum sikeresen feldolgozva.');
    } catch (err: unknown) {
      logger.error('DocumentUploadScreen feltöltési hiba:', getErrorMessage(err));
      showSnackbar('Nem sikerült feldolgozni a dokumentumot. Kérjük, próbáld újra később.');
    } finally {
      setUploading(false);
      setStatusText('');
    }
  };

  if (profileLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={styles.loadingText}>Cégprofil betöltése...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
          testID="document-upload-back-button"
          accessibilityLabel="Vissza a főoldalra"
        />
        <Text variant="titleLarge" style={styles.headerTitle}>
          Dokumentum feltöltése
        </Text>
      </View>

      <Banner
        visible={lowConfidenceVisible}
        actions={[
          {
            label: 'Újra fotózom',
            onPress: () => setLowConfidenceVisible(false),
          },
        ]}
        icon="alert"
      >
        A dokumentum minősége nem megfelelő. Kérjük, tölts fel egy tisztább, olvashatóbb mérleget vagy főkönyvet!
      </Banner>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card} mode="elevated">
          <Card.Title
            title="Master Document Base"
            subtitle="Tölts fel mérleget, főkönyvet vagy éves beszámolót."
          />
          <Card.Content>
            <Text variant="bodyMedium" style={styles.description}>
              A Gemini OCR kiolvassa a fő pénzügyi mutatókat, majd frissíti a cégprofilodat.
            </Text>
            {selectedFileName && (
              <Text variant="bodySmall" style={styles.fileName}>
                Kiválasztott fájl: {selectedFileName}
              </Text>
            )}
            {uploading && (
              <View style={styles.progressContainer}>
                <ActivityIndicator size="small" color="#1976D2" />
                <Text variant="bodyMedium" style={styles.statusText}>
                  {statusText}
                </Text>
              </View>
            )}
            <Button
              mode="contained"
              icon="file-upload"
              onPress={handlePickAndUpload}
              loading={uploading}
              disabled={uploading || !profile}
              style={styles.primaryButton}
              accessibilityLabel="Pénzügyi dokumentum kiválasztása és feltöltése"
            >
              Dokumentum kiválasztása
            </Button>
            {!profile && (
              <Text variant="bodySmall" style={styles.missingProfileText}>
                A feltöltéshez először cégprofil szükséges.
              </Text>
            )}
          </Card.Content>
        </Card>

        {extractedData && (
          <Card style={styles.card} mode="elevated">
            <Card.Title title="Kinyert pénzügyi adatok" />
            <Card.Content>
              <ResultRow label="Nettó árbevétel" value={formatCurrency(extractedData.net_revenue)} />
              <ResultRow label="EBITDA" value={formatCurrency(extractedData.ebitda)} />
              <ResultRow label="Saját tőke" value={formatCurrency(extractedData.equity)} />
              <ResultRow label="Létszám" value={formatNumber(extractedData.employee_count)} />
              <ResultRow label="Dokumentum éve" value={formatNumber(extractedData.document_year)} />
              <ResultRow
                label="Kinyerés megbízhatósága"
                value={formatConfidence(extractedData.extraction_confidence)}
              />
              {extractedData.notes && (
                <Text variant="bodySmall" style={styles.notes}>
                  Megjegyzés: {extractedData.notes}
                </Text>
              )}
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.resultRow}>
      <Text variant="bodyMedium" style={styles.resultLabel}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.resultValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    elevation: 2,
    marginBottom: 8,
  },
  headerTitle: {
    flex: 1,
    fontWeight: 'bold',
    color: '#1A237E',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
  },
  description: {
    color: '#555555',
    marginBottom: 16,
  },
  fileName: {
    color: '#666666',
    marginBottom: 12,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusText: {
    marginLeft: 12,
    color: '#1A237E',
  },
  primaryButton: {
    backgroundColor: '#1976D2',
  },
  missingProfileText: {
    marginTop: 12,
    color: '#B00020',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  resultLabel: {
    color: '#666666',
  },
  resultValue: {
    flex: 1,
    textAlign: 'right',
    fontWeight: '600',
    color: '#212121',
    marginLeft: 16,
  },
  notes: {
    marginTop: 12,
    color: '#555555',
  },
});
