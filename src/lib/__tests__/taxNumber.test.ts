import { huTaxNumberWarning, normalizeHuTaxNumber } from '../taxNumber';

// 12345676: digits 1-7 weighted 9,7,3,1,9,7,3 sum to 144, so the check digit is 6.
const VALID = '12345676-2-41';

describe('huTaxNumberWarning (owner GO, Telegram 10614)', () => {
  it('an empty field is fine: the tax number is optional', () => {
    expect(huTaxNumberWarning('')).toBeNull();
    expect(huTaxNumberWarning('   ')).toBeNull();
    expect(huTaxNumberWarning(null)).toBeNull();
    expect(huTaxNumberWarning(undefined)).toBeNull();
  });

  it('a well-formed number with a correct check digit gives no warning, with or without separators', () => {
    expect(huTaxNumberWarning(VALID)).toBeNull();
    expect(huTaxNumberWarning('12345676241')).toBeNull();
    expect(huTaxNumberWarning(' 12345676 2 41 ')).toBeNull();
    expect(huTaxNumberWarning('11111111-1-11')).toBeNull();
    expect(huTaxNumberWarning('10625790-4-44')).toBeNull();
    // The valid example of python-stdnum's stdnum/hu/anum.py, an independent implementation of the same rule.
    expect(huTaxNumberWarning('12892312-2-41')).toBeNull();
  });

  it('a wrong check digit warns', () => {
    expect(huTaxNumberWarning('12345678-1-12')).toMatch(/ellenőrző számjegy/);
    expect(huTaxNumberWarning('12345675-2-41')).toMatch(/ellenőrző számjegy/);
    expect(huTaxNumberWarning('12892313-2-41')).toMatch(/ellenőrző számjegy/); // stdnum's invalid example
  });

  it('anything not in the 8-1-2 shape warns about the shape', () => {
    for (const raw of ['1234567', '12345676', '12345676-2', '12345676-2-4', '12345676-2-411', 'HU12345676', '1234567a-2-41', '1234-5676-2-41']) {
      expect(huTaxNumberWarning(raw)).toMatch(/formája: 12345678-1-12/);
    }
  });
});

describe('normalizeHuTaxNumber (VIES pre-fill, unchanged)', () => {
  it('still returns the first 8 digits regardless of the check digit', () => {
    expect(normalizeHuTaxNumber('12345678-1-12')).toBe('12345678');
    expect(normalizeHuTaxNumber('HU 12345678')).toBe('12345678');
    expect(normalizeHuTaxNumber('1234567')).toBeNull();
  });
});
