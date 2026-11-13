import { cellKey, compareKeys } from '@/lib/tableSort';

describe('tri des colonnes', () => {
  it('reconnaît prix, pourcentages, fractions, postes, texte et vides', () => {
    expect(cellKey('1 234,5 €')).toBe(1234.5);
    expect(cellKey('−20 %')).toBe(-20);
    expect(cellKey('18 / 25')).toBe(18);
    expect(cellKey('Défenseur / Milieu')).toBe(1);
    expect(cellKey('—')).toBeNull();
    expect(cellKey('PSV')).toBe('psv');
  });
  it('vides à la fin dans les deux sens', () => {
    const keys = [3, null, 10, 1];
    expect([...keys].sort((a, b) => compareKeys(a, b, false))).toEqual([10, 3, 1, null]);
    expect([...keys].sort((a, b) => compareKeys(a, b, true))).toEqual([1, 3, 10, null]);
  });
});
