/**
 * Standard application logger.
 * Centralizes logging to allow easy integration with remote error tracking services
 * (like Sentry or Crashlytics) in the future.
 */

export const logger = {
  info: (...args: any[]) => {
    console.info(...args);
  },
  warn: (...args: any[]) => {
    console.warn(...args);
  },
  error: (...args: any[]) => {
    console.error(...args);
  },
  debug: (...args: any[]) => {
    console.debug(...args);
  }
};
