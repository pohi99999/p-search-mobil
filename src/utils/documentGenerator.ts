import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Generál egy PDF fájlt a megadott HTML tartalomból, majd megnyitja a natív megosztási ablakot.
 * @param htmlContent A PDF-be generálandó HTML kód.
 * @param fileName A megosztási ablakban megjelenő fájlnév.
 */
export async function generateAndSharePDF(htmlContent: string, fileName: string): Promise<void> {
  try {
    // 1. PDF előállítása a HTML szövegből egy ideiglenes fájlba
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
    });

    // 2. Ellenőrizzük, hogy a megosztás funkció elérhető-e az eszközön
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('A megosztás nem támogatott ezen az eszközön.');
    }

    // 3. Natív megosztási panel megnyitása a PDF fájl URI-jével
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: fileName,
      UTI: 'com.adobe.pdf', // iOS UTI (Uniform Type Identifier) kompatibilitásért
    });

  } catch (error: unknown) {
    console.error('Hiba történt a PDF generálása vagy megosztása során:', error);
    throw new Error((error instanceof Error ? error.message : String(error)) || 'Nem sikerült előállítani vagy megosztani a PDF dokumentumot.');
  }
}
