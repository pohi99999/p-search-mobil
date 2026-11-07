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
});
