import { detailedPosition, formationOf, lineupPositions } from '@/domain/positions';
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
  it('par défaut la colonne 1 est à droite (ordre des lignes Sorare)', () => {
    expect(detailedPosition('4-3-3', '2:1')).toBe('RB');
    expect(detailedPosition('4-3-3', '4:3')).toBe('LW');
  });
  it('formations rares déduites par la règle générale', () => {
    const lines = (f: string) => f.split('-').map((_, i) => Array.from({ length: Number(f.split('-')[i]) }, (_, j) => detailedPosition(f, `${i + 2}:${j + 1}`, 'left')).join(' '));
    expect(lines('4-3-1-2')).toEqual(['LB CB CB RB', 'CM CM CM', 'AM', 'ST ST']);
    expect(lines('3-4-1-2')).toEqual(['CB CB CB', 'LWB CM CM RWB', 'AM', 'ST ST']);
    expect(lines('4-1-2-1-2')).toEqual(['LB CB CB RB', 'DM', 'CM CM', 'AM', 'ST ST']);
    expect(lines('4-2-2-2')).toEqual(['LB CB CB RB', 'DM DM', 'AM AM', 'ST ST']);
    expect(lines('4-3-2-1')).toEqual(['LB CB CB RB', 'CM CM CM', 'AM AM', 'ST']);
    expect(lines('3-5-1-1')).toEqual(['CB CB CB', 'LWB CM CM CM RWB', 'AM', 'ST']);
  });
  it('grille en miroir quand la colonne 1 est à droite', () => {
    expect(detailedPosition('4-3-3', '2:1', 'right')).toBe('RB');
    expect(detailedPosition('4-3-3', '4:3', 'right')).toBe('LW');
  });
  it('cas invalides → null', () => {
    expect(detailedPosition('abc', '2:1')).toBeNull();
    expect(detailedPosition('', '2:1')).toBeNull();
    expect(detailedPosition(null, '2:1')).toBeNull();
    expect(detailedPosition('4-4-2', null)).toBeNull();
    expect(detailedPosition('4-4-2', '7:1')).toBeNull();
    expect(detailedPosition('4-4-2', '2:5')).toBeNull();
    expect(detailedPosition('4-4-2', 'abc')).toBeNull();
  });
});

const p = (slug: string) => ({ slug });

describe('compo Sorare', () => {
  // Compo réelle PSG–OL (lignes de droite à gauche, gardien en premier)
  const psg = [
    [p('safonov')],
    [p('hakimi'), p('zabarnyi'), p('pacho'), p('zaire-emery')],
    [p('joao-neves'), p('vitinha'), p('fabian-ruiz')],
    [p('akliouche'), p('ferran-torres'), p('doue')],
  ];
  it('formationOf', () => expect(formationOf(psg)).toBe('4-3-3'));
  it('postes précis de chaque titulaire', () => {
    const pos = lineupPositions(psg);
    expect(Object.fromEntries(pos)).toEqual({
      safonov: 'GK', hakimi: 'RB', zabarnyi: 'CB', pacho: 'CB', 'zaire-emery': 'LB',
      'joao-neves': 'CM', vitinha: 'CM', 'fabian-ruiz': 'CM', akliouche: 'RW', 'ferran-torres': 'ST', doue: 'LW',
    });
  });
  it('4-2-3-1 (Barcelone)', () => {
    const barca = [[p('garcia')], [p('espart'), p('cubarsi'), p('martin'), p('cancelo')], [p('bernal'), p('pedri')], [p('yamal'), p('olmo'), p('gordon')], [p('raphinha')]];
    const pos = lineupPositions(barca);
    expect([pos.get('yamal'), pos.get('olmo'), pos.get('gordon'), pos.get('raphinha'), pos.get('bernal'), pos.get('cancelo')]).toEqual(['RW', 'AM', 'LW', 'ST', 'DM', 'LB']);
  });
  it('compo vide → aucun poste', () => {
    expect(lineupPositions([]).size).toBe(0);
    expect(formationOf([])).toBeNull();
  });
});
