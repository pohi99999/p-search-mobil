import { generateAndSharePDF } from './documentGenerator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Mock the modules
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

describe('generateAndSharePDF', () => {
  const mockHtmlContent = '<h1>Test HTML</h1>';
  const mockFileName = 'test-file.pdf';
  const mockUri = 'file://path/to/test-file.pdf';

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations for happy path
    (Print.printToFileAsync as jest.Mock).mockResolvedValue({ uri: mockUri });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

    // Spy on console.error to avoid noise in test output
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('should generate a PDF and share it successfully', async () => {
    await generateAndSharePDF(mockHtmlContent, mockFileName);

    // Verify Print.printToFileAsync was called correctly
    expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
    expect(Print.printToFileAsync).toHaveBeenCalledWith({
      html: mockHtmlContent,
    });

    // Verify Sharing.isAvailableAsync was called
    expect(Sharing.isAvailableAsync).toHaveBeenCalledTimes(1);

    // Verify Sharing.shareAsync was called correctly
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(mockUri, {
      mimeType: 'application/pdf',
      dialogTitle: mockFileName,
      UTI: 'com.adobe.pdf',
    });
  });

  it('should throw an error if sharing is not available', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

    await expect(generateAndSharePDF(mockHtmlContent, mockFileName))
      .rejects
      .toThrow('A megosztás nem támogatott ezen az eszközön.');

    expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('should handle and re-throw errors from Print.printToFileAsync', async () => {
    const errorMessage = 'Print failed';
    (Print.printToFileAsync as jest.Mock).mockRejectedValue(new Error(errorMessage));

    await expect(generateAndSharePDF(mockHtmlContent, mockFileName))
      .rejects
      .toThrow(errorMessage);

    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('should handle and re-throw errors from Sharing.shareAsync', async () => {
    const errorMessage = 'Sharing failed';
    (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error(errorMessage));

    await expect(generateAndSharePDF(mockHtmlContent, mockFileName))
      .rejects
      .toThrow(errorMessage);

    expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
    expect(Sharing.isAvailableAsync).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
  });

  it('should handle non-Error objects being thrown', async () => {
    (Print.printToFileAsync as jest.Mock).mockRejectedValue('String error message');

    await expect(generateAndSharePDF(mockHtmlContent, mockFileName))
      .rejects
      .toThrow('String error message');

    expect(console.error).toHaveBeenCalled();
  });
});
