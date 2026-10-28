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

describe('lignes de 5 : placement Opta', () => {
  const pl = (slug: string) => ({ slug });
  const row = (...slugs: string[]) => slugs.map(pl);
  it('3-5-2 de Mayence : pistons repérés par leur numéro (2 droit, 3 gauche), quel que soit leur rang', () => {
    const rows = [row('gk'), row('d6', 'd5', 'd4'), row('lee', 'sano', 'amiri', 'caci', 'mwene'), row('becker', 'tietz')];
    const places = new Map([['gk', 1], ['d6', 6], ['d5', 5], ['d4', 4], ['lee', 7], ['sano', 11], ['amiri', 8], ['caci', 2], ['mwene', 3], ['becker', 10], ['tietz', 9]]);
    const pos = lineupPositions(rows, places);
    expect([pos.get('caci'), pos.get('mwene'), pos.get('lee'), pos.get('sano'), pos.get('amiri')]).toEqual(['RWB', 'LWB', 'CM', 'CM', 'CM']);
    expect(pos.get('d5')).toBe('CB');
  });
  it('défense à 5 et milieu à 5 devant une défense à 4', () => {
    const back5 = lineupPositions([row('gk'), row('a', 'b', 'c', 'd', 'e'), row('m1', 'm2', 'm3'), row('s1', 's2')],
      new Map([['a', 5], ['b', 3], ['c', 6], ['d', 2], ['e', 4]]));
    expect(['a', 'b', 'c', 'd', 'e'].map((x) => back5.get(x))).toEqual(['CB', 'LWB', 'CB', 'RWB', 'CB']);
    const mid5 = lineupPositions([row('gk'), row('rb', 'cb1', 'cb2', 'lb'), row('a', 'b', 'c', 'd', 'e'), row('st')],
      new Map([['a', 4], ['b', 11], ['c', 8], ['d', 7], ['e', 10]]));
    expect(['a', 'b', 'c', 'd', 'e'].map((x) => mid5.get(x))).toEqual(['CM', 'LW', 'CM', 'RW', 'CM']);
  });
  it('sans numéro de placement : règle par côté inchangée', () => {
    const pos = lineupPositions([row('gk'), row('d1', 'd2', 'd3'), row('r', 'x', 'y', 'z', 'l'), row('s1', 's2')]);
    expect(pos.get('r')).toBe('RWB');
    expect(pos.get('l')).toBe('LWB');
  });
});
