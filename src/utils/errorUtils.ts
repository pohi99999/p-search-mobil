/**
 * Utility functions for handling and formatting errors.
 */

/**
 * Extracts a string error message from an unknown error object.
 * @param err The unknown error object.
 * @returns The string representation of the error.
 */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Formats a user-facing error message specifically for the Copilot chat.
 * @param err The unknown error object from a chat request.
 * @returns A formatted string message for the user.
 */
export function formatChatErrorMessage(err: unknown): string {
  const errorMessage = getErrorMessage(err);

  if (errorMessage && errorMessage.includes('Sajnálom')) {
    return errorMessage;
  }

  return `Sajnálom, nem sikerült elérnem a P-Search AI asszisztenst: ${errorMessage || 'hálózati hiba'}. Kérlek, ellenőrizd a kapcsolatot és próbáld újra!`;
}
