import { getErrorMessage, isPurchasesError, formatChatErrorMessage } from './error';

describe('getErrorMessage', () => {
  it('returns the message property if error is an Error instance', () => {
    const error = new Error('This is an error message');
    expect(getErrorMessage(error)).toBe('This is an error message');
  });

  it('returns stringified error if error is a string', () => {
    const error = 'This is a string error';
    expect(getErrorMessage(error)).toBe('This is a string error');
  });

  it('returns stringified error if error is a number', () => {
    const error = 404;
    expect(getErrorMessage(error)).toBe('404');
  });

  it('returns stringified error if error is an object', () => {
    const error = { code: 500, message: 'Server error' };
    expect(getErrorMessage(error)).toBe('[object Object]');
  });

  it('returns stringified error if error is null', () => {
    const error = null;
    expect(getErrorMessage(error)).toBe('null');
  });

  it('returns stringified error if error is undefined', () => {
    const error = undefined;
    expect(getErrorMessage(error)).toBe('undefined');
  });
});

describe('isPurchasesError', () => {
  it('returns true if error has a code property', () => {
    const error = { code: '1' };
    expect(isPurchasesError(error)).toBe(true);
  });

  it('returns false if error is not an object', () => {
    expect(isPurchasesError('error')).toBe(false);
    expect(isPurchasesError(123)).toBe(false);
  });

  it('returns false if error is null', () => {
    expect(isPurchasesError(null)).toBe(false);
  });
});

describe('formatChatErrorMessage', () => {
  it('returns the original message if it already includes "Sajnálom"', () => {
    const error = new Error('Sajnálom, hiba történt');
    expect(formatChatErrorMessage(error)).toBe('Sajnálom, hiba történt');
  });

  it('wraps the error message in a standard format if it does not contain "Sajnálom"', () => {
    const error = new Error('Valami rosszul sült el');
    expect(formatChatErrorMessage(error)).toBe(
      'Sajnálom, nem sikerült elérnem a P-Search AI asszisztenst: Valami rosszul sült el. Kérlek, ellenőrizd a kapcsolatot és próbáld újra!'
    );
  });

  it('uses a fallback message if the extracted error message is empty', () => {
    const error = new Error('');
    expect(formatChatErrorMessage(error)).toBe(
      'Sajnálom, nem sikerült elérnem a P-Search AI asszisztenst: hálózati hiba. Kérlek, ellenőrizd a kapcsolatot és próbáld újra!'
    );
  });
});
