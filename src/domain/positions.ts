import type { DetailedPosition } from './types';

export type GridSide = 'left' | 'right';

/** Côté du terrain correspondant à la colonne 1 de la grille API-Football. Provisoire : voir docs/spike-results.md. */
export const GRID_COL1_SIDE: GridSide = 'left';

type Line = DetailedPosition[];

/** Lignes hors gardien, de la défense à l'attaque, colonnes de gauche à droite. */
const FORMATIONS: Record<string, Line[]> = {
  '4-4-2': [['LB', 'CB', 'CB', 'RB'], ['LW', 'CM', 'CM', 'RW'], ['ST', 'ST']],
  '4-3-3': [['LB', 'CB', 'CB', 'RB'], ['CM', 'CM', 'CM'], ['LW', 'ST', 'RW']],
  '4-2-3-1': [['LB', 'CB', 'CB', 'RB'], ['DM', 'DM'], ['LW', 'AM', 'RW'], ['ST']],
  '3-5-2': [['CB', 'CB', 'CB'], ['LWB', 'CM', 'CM', 'CM', 'RWB'], ['ST', 'ST']],
  '3-4-3': [['CB', 'CB', 'CB'], ['LWB', 'CM', 'CM', 'RWB'], ['LW', 'ST', 'RW']],
  '5-3-2': [['LWB', 'CB', 'CB', 'CB', 'RWB'], ['CM', 'CM', 'CM'], ['ST', 'ST']],
  '4-1-4-1': [['LB', 'CB', 'CB', 'RB'], ['DM'], ['LW', 'CM', 'CM', 'RW'], ['ST']],
  '4-4-1-1': [['LB', 'CB', 'CB', 'RB'], ['LW', 'CM', 'CM', 'RW'], ['AM'], ['ST']],
  '3-4-2-1': [['CB', 'CB', 'CB'], ['LWB', 'CM', 'CM', 'RWB'], ['AM', 'AM'], ['ST']],
  '5-4-1': [['LWB', 'CB', 'CB', 'CB', 'RWB'], ['LW', 'CM', 'CM', 'RW'], ['ST']],
};

export const isKnownFormation = (formation: string) => formation in FORMATIONS;

export function detailedPosition(
  formation: string | null,
  grid: string | null,
  col1Side: GridSide = GRID_COL1_SIDE,
): DetailedPosition | null {
  const m = grid ? /^(\d+):(\d+)$/.exec(grid) : null;
  if (!m) return null;
  const row = Number(m[1]);
  const col = Number(m[2]);
  if (row === 1) return col === 1 ? 'GK' : null;
  const lines = formation ? FORMATIONS[formation] : undefined;
  if (!lines) return null;
  const line = lines[row - 2];
  if (!line || col < 1 || col > line.length) return null;
  return col1Side === 'left' ? line[col - 1] : line[line.length - col];
}
