import { logger } from './logger';

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
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    console.debug = jest.fn();
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
      expect(console.log).toHaveBeenCalledWith('test info');
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
      expect(console.log).not.toHaveBeenCalled();
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
      expect(console.log).not.toHaveBeenCalled();
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
});
