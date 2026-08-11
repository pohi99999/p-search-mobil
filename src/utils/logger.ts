/**
 * Standard application logger.
 * Centralizes logging to allow easy integration with remote error tracking services
 * (like Sentry or Crashlytics) in the future.
 */

export const logger = {
  info: (...args: unknown[]) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.info(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(...args);
    }
  },
  debug: (...args: unknown[]) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.debug(...args);
    }
  }
};
