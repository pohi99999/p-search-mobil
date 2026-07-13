import { getErrorMessage } from './error';

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
