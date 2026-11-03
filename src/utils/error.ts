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

  // Card [J]: the raw error ("Failed to send a request to the Edge Function") reached the chat bubble in English.
  // It is logged by the caller (useCopilotChat logger.error); the user gets one plain Hungarian sentence.
  return 'Sajnálom, most nem érem el a P-Search asszisztenst. Ellenőrizd az internetkapcsolatot, és küldd el újra a kérdést.';
};
