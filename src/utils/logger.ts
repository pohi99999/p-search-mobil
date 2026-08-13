import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from '../config/env';

/**
 * Standard application logger.
 * Centralizes logging: console output stays dev-only (as before), while
 * warn()/error() also report to Sentry when EXPO_PUBLIC_SENTRY_DSN is
 * configured -- so production issues aren't silently dropped just because
 * __DEV__ suppresses console output.
 */

function reportToSentry(level: 'warning' | 'error', args: unknown[]) {
  if (!SENTRY_DSN) return;
  const errorArg = args.find((arg): arg is Error => arg instanceof Error);
  if (errorArg) {
    Sentry.captureException(errorArg);
  } else {
    const message = args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
    Sentry.captureMessage(message, level);
  }
}

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
    reportToSentry('warning', args);
  },
  error: (...args: unknown[]) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(...args);
    }
    reportToSentry('error', args);
  },
  debug: (...args: unknown[]) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.debug(...args);
    }
  }
};
