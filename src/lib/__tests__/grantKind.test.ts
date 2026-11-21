import { grantKindLabel } from '../grantKind';

describe('grantKindLabel', () => {
  // The five values live on 2026-11-07 (Marveen 6662), and the two more spellings of 2026-10-19 (grant-kind.test.ts).
  it.each([
    ['Vissza nem térítendő támogatás (VNT)', 'grant', 'Támogatás', 'Támogatás'],
    ['Vissza nem térítendő és hitel', 'mixed', 'Vegyes', 'Vegyes: támogatás és hitel'],
    ['Pénzügyi eszköz– hitel', 'loan', 'Hitel', 'Hitel'],
    ['hitel', 'loan', 'Hitel', 'Hitel'],
    ['Pénzügyi eszköz – kockázati tőke', 'equity', 'Kockázati tőke', 'Kockázati tőke'],
    ['vissza nem térítendő', 'grant', 'Támogatás', 'Támogatás'],
    ['Vissza nem térítendő és hitel hibrid', 'mixed', 'Vegyes', 'Vegyes: támogatás és hitel'],
  ])('%s -> %s', (text, kind, label, detail) => {
    expect(grantKindLabel(text)).toEqual({ kind, label, detail });
  });

  it('a loan with venture capital is mixed, not a plain loan', () => {
    expect(grantKindLabel('hitel és kockázati tőke')).toEqual({ kind: 'mixed', label: 'Vegyes', detail: 'Vegyes: hitel és kockázati tőke' });
  });

  // Marveen 6662: no false label on an unknown or empty value.
  it.each([[null], [undefined], [''], ['   '], ['Egyéb'], ['Test'], ['Pénzügyi eszköz'], ['pályázat']])('%p has no label', (text) => {
    expect(grantKindLabel(text)).toBeNull();
  });

  // Round 11-21 (Ellenőr J1-J3, card dc1b408e).
  it.each([
    // the four spellings live in the source on 2026-11-21 (54 active tenders)
    ['Vissza nem térítendő támogatás (VNT)', 'grant'],
    ['Pénzügyi eszköz– hitel', 'loan'],
    ['Pénzügyi eszköz – kockázati tőke', 'equity'],
    ['Vissza nem térítendő és hitel', 'mixed'],
    // K4, K6: "kölcsön" and any letter case are a loan
    ['kölcsön', 'loan'],
    ['Kamatmentes KÖLCSÖN', 'loan'],
    ['HITEL', 'loan'],
    ['Hitel', 'loan'],
    ['VISSZA NEM TÉRÍTENDŐ', 'grant'],
  ])('%s -> %s', (text, kind) => {
    expect(grantKindLabel(text)?.kind).toBe(kind);
  });

  it('J1: a repayable support is not labelled as a grant', () => {
    const repayable = { kind: 'repayable', label: 'Visszatérítendő', detail: 'Visszatérítendő támogatás' };
    expect(grantKindLabel('Visszatérítendő támogatás')).toEqual(repayable);
    expect(grantKindLabel('visszatérítendő')).toEqual(repayable);
  });

  it('J1: repayable with a loan is a loan, with a non-repayable part it is mixed', () => {
    expect(grantKindLabel('Visszatérítendő hitel')?.kind).toBe('loan');
    expect(grantKindLabel('Vissza nem térítendő és visszatérítendő hitel')).toEqual({
      kind: 'mixed',
      label: 'Vegyes',
      detail: 'Vegyes: támogatás és hitel',
    });
  });

  it('J2 (decided): a grant with venture capital is mixed on the label', () => {
    expect(grantKindLabel('Vissza nem térítendő támogatás és kockázati tőke')?.detail).toBe('Vegyes: támogatás és kockázati tőke');
  });
});
