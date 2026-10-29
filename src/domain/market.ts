// Marché des cartes Limited : valeur estimée d'après les performances et prix potentiel avant la Game Week.
import type { GenericPosition } from './types';

/** Joueur coté : prix de référence de sa carte de la saison et ce qui fait son prix sur le marché. */
export interface MarketRow {
  playerId: number;
  price: number;
  l15: number;
  l5: number;
  startRate: number;
  age: number | null;
  league: string;
  position: GenericPosition;
}

export interface PriceModel { coef: number[]; leagues: string[]; positions: GenericPosition[]; meanAge: number }

/** En dessous, pas assez de joueurs cotés pour estimer une valeur. */
export const MIN_FIT_ROWS = 30;
/** Rétrécissement des coefficients (régression ridge) : évite les valeurs extrêmes avec peu de joueurs par ligue. */
const RIDGE = 1;

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Variables du modèle : niveau (L15), forme (L5 − L15), titularisations, âge (et son carré : les jeunes se paient plus cher,
 * les plus âgés moins), championnat et poste. Les scores sont divisés par 10 pour des coefficients lisibles.
 */
function features(r: Omit<MarketRow, 'playerId' | 'price'>, m: Omit<PriceModel, 'coef'>): number[] {
  const age = ((r.age ?? m.meanAge) - m.meanAge) / 5;
  return [
    1, r.l15 / 10, (r.l5 - r.l15) / 10, r.startRate, age, age * age,
    ...m.leagues.slice(1).map((l) => (r.league === l ? 1 : 0)),
    ...m.positions.slice(1).map((p) => (r.position === p ? 1 : 0)),
  ];
}

/** Résout A x = b (élimination de Gauss avec pivot partiel). */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    if (Math.abs(m[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

/** Régression du logarithme du prix sur les performances, sur tout le marché ; null s'il y a trop peu de joueurs cotés. */
export function fitPriceModel(rows: MarketRow[]): PriceModel | null {
  const usable = rows.filter((r) => r.price > 0);
  if (usable.length < MIN_FIT_ROWS) return null;
  const ages = usable.map((r) => r.age).filter((a): a is number => a !== null);
  const base = {
    leagues: [...new Set(usable.map((r) => r.league))].sort(),
    positions: [...new Set(usable.map((r) => r.position))].sort() as GenericPosition[],
    meanAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 26,
  };
  const x = usable.map((r) => features(r, base));
  const y = usable.map((r) => Math.log(r.price));
  const k = x[0].length;
  const xtx = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) =>
    x.reduce((t, row) => t + row[i] * row[j], 0) + (i === j && i > 0 ? RIDGE : 0)));
  const xty = Array.from({ length: k }, (_, i) => x.reduce((t, row, n) => t + row[i] * y[n], 0));
  return { ...base, coef: solve(xtx, xty) };
}

const linear = (m: PriceModel, r: Omit<MarketRow, 'playerId' | 'price'>) => features(r, m).reduce((t, v, i) => t + v * m.coef[i], 0);

/** Prix « juste » d'après les performances : ce que le marché paie en moyenne pour ce profil. */
export function fairPrice(m: PriceModel, r: Omit<MarketRow, 'playerId' | 'price'>): number {
  return Math.exp(linear(m, r));
}

/**
 * Prix potentiel si le joueur marque `projected` à son prochain match : son L5 et son L15 intègrent ce score,
 * et le prix évolue comme le marché valorise ces moyennes (même modèle).
 */
export function potentialPrice(m: PriceModel, r: MarketRow, projected: number): number {
  const after = { ...r, l5: (4 * r.l5 + projected) / 5, l15: (14 * r.l15 + projected) / 15 };
  return r.price * Math.exp(linear(m, after) - linear(m, r));
}

/** Évolution du prix : médiane des ventes des 7 derniers jours / médiane des 21 jours précédents − 1. */
export function priceTrend(sales: { date: string; eur: number }[], now = Date.now()): number | null {
  const day = 86_400_000;
  const recent = median(sales.filter((s) => now - Date.parse(s.date) <= 7 * day).map((s) => s.eur));
  const before = median(sales.filter((s) => {
    const age = now - Date.parse(s.date);
    return age > 7 * day && age <= 28 * day;
  }).map((s) => s.eur));
  return recent !== null && before ? recent / before - 1 : null;
}
