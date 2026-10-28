import { detailedPosition, isKnownFormation } from '@/domain/positions';
import type { DetailedPosition } from '@/domain/types';

const TABLE: Record<string, string[]> = {
  '4-4-2': ['LB CB CB RB', 'LW CM CM RW', 'ST ST'],
  '4-3-3': ['LB CB CB RB', 'CM CM CM', 'LW ST RW'],
  '4-2-3-1': ['LB CB CB RB', 'DM DM', 'LW AM RW', 'ST'],
  '3-5-2': ['CB CB CB', 'LWB CM CM CM RWB', 'ST ST'],
  '3-4-3': ['CB CB CB', 'LWB CM CM RWB', 'LW ST RW'],
  '5-3-2': ['LWB CB CB CB RWB', 'CM CM CM', 'ST ST'],
  '4-1-4-1': ['LB CB CB RB', 'DM', 'LW CM CM RW', 'ST'],
  '4-4-1-1': ['LB CB CB RB', 'LW CM CM RW', 'AM', 'ST'],
  '3-4-2-1': ['CB CB CB', 'LWB CM CM RWB', 'AM AM', 'ST'],
  '5-4-1': ['LWB CB CB CB RWB', 'LW CM CM RW', 'ST'],
};

describe('detailedPosition', () => {
  for (const [formation, lines] of Object.entries(TABLE)) {
    it(`${formation} : toutes les cases`, () => {
      lines.forEach((line, i) => {
        line.split(' ').forEach((expected, j) => {
          expect(detailedPosition(formation, `${i + 2}:${j + 1}`, 'left')).toBe(expected as DetailedPosition);
        });
      });
    });
  }
  it('gardien', () => expect(detailedPosition('4-4-2', '1:1')).toBe('GK'));
  it('gardien même avec une formation inconnue', () => expect(detailedPosition('4-3-1-2', '1:1')).toBe('GK'));
  it('isKnownFormation', () => {
    expect(isKnownFormation('4-2-3-1')).toBe(true);
    expect(isKnownFormation('4-3-1-2')).toBe(false);
  });
  it('grille en miroir quand la colonne 1 est à droite', () => {
    expect(detailedPosition('4-3-3', '2:1', 'right')).toBe('RB');
    expect(detailedPosition('4-3-3', '4:3', 'right')).toBe('LW');
  });
  it('cas invalides → null', () => {
    expect(detailedPosition('4-3-2-1', '2:1')).toBeNull();
    expect(detailedPosition(null, '2:1')).toBeNull();
    expect(detailedPosition('4-4-2', null)).toBeNull();
    expect(detailedPosition('4-4-2', '7:1')).toBeNull();
    expect(detailedPosition('4-4-2', '2:5')).toBeNull();
    expect(detailedPosition('4-4-2', 'abc')).toBeNull();
  });
});
