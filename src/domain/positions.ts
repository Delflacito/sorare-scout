import type { DetailedPosition } from './types';

export type GridSide = 'left' | 'right';

/** Côté du terrain de la colonne 1 : dans les compos Sorare, chaque ligne est rangée de droite à gauche. */
export const GRID_COL1_SIDE: GridSide = 'right';

type Line = DetailedPosition[];

const wide = (n: number, left: DetailedPosition, inner: DetailedPosition, right: DetailedPosition): Line =>
  Array.from({ length: n }, (_, i) => (i === 0 ? left : i === n - 1 ? right : inner));

/**
 * Postes de chaque ligne hors gardien, de la défense à l'attaque, colonnes de gauche à droite.
 * Règle générale valable pour toute formation (4-4-2, 4-2-3-1, 3-4-1-2, losange…).
 */
function formationLines(formation: string): Line[] | null {
  const counts = formation.split('-').map(Number);
  if (counts.length < 2 || counts.some((n) => !Number.isInteger(n) || n < 1)) return null;
  const last = counts.length - 1;
  const middles = last - 1;
  const backThree = counts[0] === 3;
  return counts.map((n, i): Line => {
    if (i === 0) return n === 4 ? wide(4, 'LB', 'CB', 'RB') : n === 5 ? wide(5, 'LWB', 'CB', 'RWB') : Array(n).fill('CB');
    if (i === last) return n === 3 ? wide(3, 'LW', 'ST', 'RW') : Array(n).fill('ST');
    if (n >= 4) return backThree ? wide(n, 'LWB', 'CM', 'RWB') : wide(n, 'LW', 'CM', 'RW');
    if (middles >= 2 && i === 1) return Array(n).fill(n <= 2 ? 'DM' : 'CM');
    if (middles >= 2 && i === last - 1) return n === 3 ? wide(3, 'LW', 'AM', 'RW') : Array(n).fill('AM');
    return Array(n).fill(n === 1 && middles === 1 ? 'DM' : 'CM');
  });
}

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
  const lines = formation ? formationLines(formation) : null;
  const line = lines?.[row - 2];
  if (!line || col < 1 || col > line.length) return null;
  return col1Side === 'left' ? line[col - 1] : line[line.length - col];
}

/** Formation (ex. « 4-2-3-1 ») d'une compo Sorare : lignes du gardien à l'attaque. */
export function formationOf(rows: unknown[][]): string | null {
  return rows.length > 1 ? rows.slice(1).map((r) => r.length).join('-') : null;
}

/** Poste précis de chaque titulaire d'une compo Sorare (lignes du gardien à l'attaque, rangées de droite à gauche). */
export function lineupPositions(rows: { slug: string }[][]): Map<string, DetailedPosition> {
  const formation = formationOf(rows);
  const result = new Map<string, DetailedPosition>();
  rows.forEach((row, r) =>
    row.forEach((player, c) => {
      const pos = detailedPosition(formation, `${r + 1}:${c + 1}`, 'right');
      if (pos) result.set(player.slug, pos);
    }),
  );
  return result;
}
