import * as Sentry from '@sentry/react-native';
import { logger } from './logger';

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

let mockSentryDsn = '';
jest.mock('../config/env', () => ({
  get SENTRY_DSN() {
    return mockSentryDsn;
  },
}));

describe('logger', () => {
  let originalConsole: any;
  let originalDev: any;

  beforeAll(() => {
    originalConsole = { ...console };
    originalDev = global.__DEV__;
  });

  afterAll(() => {
    global.console = originalConsole;
    global.__DEV__ = originalDev;
  });

  beforeEach(() => {
    console.info = jest.fn();
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    console.debug = jest.fn();
    mockSentryDsn = '';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when __DEV__ is true', () => {
    beforeEach(() => {
      global.__DEV__ = true;
    });

    it('logs info', () => {
      logger.info('test info');
      expect(console.info).toHaveBeenCalledWith('test info');
    });

    it('logs warn', () => {
      logger.warn('test warn');
      expect(console.warn).toHaveBeenCalledWith('test warn');
    });

    it('logs error', () => {
      logger.error('test error');
      expect(console.error).toHaveBeenCalledWith('test error');
    });

    it('logs debug', () => {
      logger.debug('test debug');
      expect(console.debug).toHaveBeenCalledWith('test debug');
    });
  });

  describe('when __DEV__ is false', () => {
    beforeEach(() => {
      global.__DEV__ = false;
    });

    it('does not log info', () => {
      logger.info('test info');
      expect(console.info).not.toHaveBeenCalled();
    });

    it('does not log warn', () => {
      logger.warn('test warn');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('does not log error', () => {
      logger.error('test error');
      expect(console.error).not.toHaveBeenCalled();
    });

    it('does not log debug', () => {
      logger.debug('test debug');
      expect(console.debug).not.toHaveBeenCalled();
    });
  });

  describe('when __DEV__ is undefined', () => {
    beforeEach(() => {
      delete (global as any).__DEV__;
    });

    afterEach(() => {
      global.__DEV__ = originalDev;
    });

    it('does not log info', () => {
      logger.info('test info');
      expect(console.info).not.toHaveBeenCalled();
    });

    it('does not log warn', () => {
      logger.warn('test warn');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('does not log error', () => {
      logger.error('test error');
      expect(console.error).not.toHaveBeenCalled();
    });

    it('does not log debug', () => {
      logger.debug('test debug');
      expect(console.debug).not.toHaveBeenCalled();
    });
  });

  describe('Sentry reporting', () => {
    beforeEach(() => {
      global.__DEV__ = false;
    });

    it('does not report to Sentry when no DSN is configured', () => {
      mockSentryDsn = '';
      logger.error('test error');
      logger.warn('test warn');
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('reports an Error instance to Sentry via captureException when a DSN is configured', () => {
      mockSentryDsn = 'https://example@sentry.io/123';
      const err = new Error('boom');
      logger.error(err);
      expect(Sentry.captureException).toHaveBeenCalledWith(err);
    });

    it('reports a non-Error error() call to Sentry via captureMessage', () => {
      mockSentryDsn = 'https://example@sentry.io/123';
      logger.error('plain string error');
      expect(Sentry.captureMessage).toHaveBeenCalledWith('plain string error', 'error');
    });

    it('reports warn() calls to Sentry via captureMessage at warning level', () => {
      mockSentryDsn = 'https://example@sentry.io/123';
      logger.warn('careful');
      expect(Sentry.captureMessage).toHaveBeenCalledWith('careful', 'warning');
    });

    it('does not report info() or debug() calls to Sentry', () => {
      mockSentryDsn = 'https://example@sentry.io/123';
      logger.info('just info');
      logger.debug('just debug');
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
  });
});
