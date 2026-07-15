import { PurchasesError } from 'react-native-purchases';

export const isPurchasesError = (error: unknown): error is PurchasesError => {
  return typeof error === 'object' && error !== null && 'code' in error;
};

export const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

export const formatChatErrorMessage = (err: unknown): string => {
  const errorMessage = getErrorMessage(err);

  if (errorMessage && errorMessage.includes('Sajnálom')) {
    return errorMessage;
  }

  return `Sajnálom, nem sikerült elérnem a P-Search AI asszisztenst: ${errorMessage || 'hálózati hiba'}. Kérlek, ellenőrizd a kapcsolatot és próbáld újra!`;
};
