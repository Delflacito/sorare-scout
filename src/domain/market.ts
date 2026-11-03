// Marché des cartes Limited : valeur estimée d'après les performances et prix potentiel avant la Game Week.
import type { GenericPosition } from './types';

/** Joueur coté : prix de référence de sa carte de la saison et ce qui fait son prix sur le marché. */
export interface MarketRow {
  playerId: number;
  price: number;
  l15: number;
  l5: number;
  /** Moyenne All-Around sur 15 matchs du club (0 si absent). */
  allAround: number;
  /** Moyenne du score décisif sur 15 matchs du club (0 si absent). */
  decisive: number;
  startRate: number;
  /** Minutes moyennes sur 15 matchs du club. */
  minutes: number;
  age: number | null;
  league: string;
  position: GenericPosition;
  teamId: number | null;
  /** Points par match du club cette saison. */
  clubPpg: number | null;
  /** Buts + passes décisives la saison passée. */
  prevGoalsAssists: number;
  international: boolean;
  /** Statut Sorare : STARTER, REGULAR, SUBSTITUTE, NOT_PLAYING… */
  status: string | null;
}

type Profile = Omit<MarketRow, 'playerId' | 'price'>;

export interface PriceModel {
  coef: number[]; leagues: string[]; positions: GenericPosition[]; meanAge: number;
  /** Prime (log) propre à chaque club : ce que le marché paie en plus ou en moins pour ce club à profil égal. */
  clubs: Record<number, number>;
}

/** En dessous, pas assez de joueurs cotés pour estimer une valeur. */
export const MIN_FIT_ROWS = 30;
/** Rétrécissement des coefficients (régression ridge) : évite les valeurs extrêmes avec peu de joueurs par ligue. */
const RIDGE = 1;
/** Prime d'un club = somme des écarts de ses joueurs / (nombre + CLUB_SHRINK) : peu de joueurs, prime ramenée vers 0. */
const CLUB_SHRINK = 3;
/** Points par match d'un club sans match joué (moyenne des championnats). */
const AVG_PPG = 1.4;
/** Part du prix habituel du joueur (ajusté à sa forme) dans la valeur estimée ; le reste vient du profil type. */
export const ANCHOR_WEIGHT = 0.7;

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Variables du modèle, choisies d'après les prix planchers d'octobre 2026 (77 % des écarts de prix expliqués hors
 * échantillon, contre 39 % avec L15 / forme / âge / ligue / poste seuls) : niveau (L15), forme (L5 − L15), All-Around,
 * temps de jeu, âge, force du club, buts + passes de la saison passée, sélection, statut Sorare, championnat et poste.
 * Ajouts d'octobre 2026 (79,5 % au lieu de 77,9 % en validation croisée) : L15² (les meilleurs se paient plus que
 * proportionnellement) et poids du score décisif et de l'All-Around propres à chaque poste (les buts comptent plus
 * pour un attaquant).
 */
function features(r: Profile, m: Omit<PriceModel, 'coef' | 'clubs'>): number[] {
  const age = ((r.age ?? m.meanAge) - m.meanAge) / 5;
  return [
    1, r.l15 / 10, (r.l5 - r.l15) / 10, r.startRate, r.allAround / 10, r.minutes / 90, age, age * age,
    r.clubPpg ?? AVG_PPG, r.prevGoalsAssists / 10, r.international ? 1 : 0,
    r.status === 'STARTER' ? 1 : 0, r.status === 'SUBSTITUTE' || r.status === 'NOT_PLAYING' ? 1 : 0,
    ...m.leagues.slice(1).map((l) => (r.league === l ? 1 : 0)),
    ...m.positions.slice(1).map((p) => (r.position === p ? 1 : 0)),
    (r.l15 / 10) ** 2,
    ...m.positions.flatMap((p) => (r.position === p ? [r.decisive / 10, r.allAround / 10] : [0, 0])),
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

const dot = (x: number[], coef: number[]) => x.reduce((t, v, i) => t + v * coef[i], 0);

/**
 * Régression du logarithme du prix sur le profil, sur tout le marché, puis prime de chaque club (écart moyen rétréci
 * de ses joueurs) ; null s'il y a trop peu de joueurs cotés.
 */
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
  const coef = solve(xtx, xty);
  const byClub = new Map<number, { sum: number; n: number }>();
  usable.forEach((r, i) => {
    if (r.teamId === null) return;
    const c = byClub.get(r.teamId) ?? { sum: 0, n: 0 };
    byClub.set(r.teamId, { sum: c.sum + y[i] - dot(x[i], coef), n: c.n + 1 });
  });
  const clubs = Object.fromEntries([...byClub].map(([id, c]) => [id, c.sum / (c.n + CLUB_SHRINK)]));
  return { ...base, coef, clubs };
}

const linear = (m: PriceModel, r: Profile) => dot(features(r, m), m.coef);

/** Prix « juste » d'après le profil : ce que le marché paie en moyenne pour ce profil dans ce club. */
export function fairPrice(m: PriceModel, r: Profile): number {
  return Math.exp(linear(m, r) + (r.teamId === null ? 0 : m.clubs[r.teamId] ?? 0));
}

/** Ajustement à la forme : effet que le modèle attribue à l'écart entre le L5 et le L15. */
export const formFactor = (m: PriceModel, r: Profile) => Math.exp(linear(m, r) - linear(m, { ...r, l5: r.l15 }));

/**
 * Valeur estimée : 70 % prix habituel du joueur (`usual`, médiane de ses enchères et reventes) ajusté à sa forme,
 * 30 % profil type (moyenne géométrique). Le profil seul ignore la notoriété : Füllkrug y valait ×7 moins que son prix.
 */
export function estimatedValue(m: PriceModel, r: Profile, usual: number): number {
  return Math.exp(ANCHOR_WEIGHT * Math.log(usual * formFactor(m, r)) + (1 - ANCHOR_WEIGHT) * Math.log(fairPrice(m, r)));
}

/**
 * Prix potentiel si le joueur marque `projected` à son prochain match : son L5, son L15 et son All-Around intègrent ce
 * score (l'écart au L15 est supposé passer par l'All-Around), et le prix évolue comme le marché valorise ces moyennes.
 * Ordre de grandeur : +10 points au-dessus du L15 ≈ +5 %, proche de la réaction observée des prix après un match.
 */
export function potentialPrice(m: PriceModel, r: MarketRow, projected: number): number {
  const after = {
    ...r, l5: (4 * r.l5 + projected) / 5, l15: (14 * r.l15 + projected) / 15, allAround: r.allAround + (projected - r.l15) / 15,
  };
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

/** Prix moyen des ventes d'un joueur un jour donné (cartes de la saison ou Classic). */
export interface DailyPrice { slug: string; day: string; price: number; inSeason: boolean }
/** Jours de la moyenne pondérée de la courbe : le jour même pèse WEIGHTED_DAYS, la veille un de moins, etc. */
export const WEIGHTED_DAYS = 3;
/** value : somme lissée ; raw : somme du jour sans lissage ; players : joueurs vendus ce jour-là. */
export interface ValuePoint { day: string; value: number; raw: number; players: number }
/** Courbes des cartes de la saison et Classic (prix de vente réels). */
export interface ValueSeries { season: ValuePoint[]; classic: ValuePoint[] }

/**
 * Évolution de la valeur d'un effectif d'après les seules ventes réelles, un point par jour sans trou. Chaque jour, chaque
 * joueur compte pour sa vente moyenne du jour s'il a été vendu, sinon pour sa dernière vente des jours précédents (avant
 * sa première vente connue : le prix de celle-ci, pour que l'entrée d'un joueur ne fasse pas monter la courbe).
 * Somme lissée par une moyenne pondérée des jours précédents.
 */
/** Part des joueurs qui doivent avoir une vente connue pour que la courbe commence. */
export const COVERAGE = 0.8;

export function valueHistory(prices: { slug: string; day: string; price: number }[], weightedDays = WEIGHTED_DAYS): ValuePoint[] {
  if (!prices.length) return [];
  const dayMs = 86_400_000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const byPlayer = new Map<string, Map<string, number>>();
  for (const p of prices) byPlayer.set(p.slug, (byPlayer.get(p.slug) ?? new Map()).set(p.day, p.price));
  // Début de la courbe : le jour où 80 % des joueurs ont déjà une vente connue. Avant, la plupart n'auraient que leur
  // première vente recopiée en arrière : une valeur inventée, plate, qui fausse l'évolution.
  const firstSales = [...byPlayer.values()].map((sales) => Date.parse([...sales.keys()].sort()[0])).sort((a, b) => a - b);
  const first = firstSales[Math.ceil(firstSales.length * COVERAGE) - 1];
  const last = Math.max(...prices.map((p) => Date.parse(p.day)));
  const days = Array.from({ length: Math.round((last - first) / dayMs) + 1 }, (_, i) => iso(first + i * dayMs));
  // Prix courant de chaque joueur au début de la courbe : sa dernière vente jusque-là, à défaut sa première vente connue.
  const startDay = iso(first);
  const known = new Map([...byPlayer].map(([slug, sales]) => {
    const keys = [...sales.keys()].sort();
    return [slug, sales.get(keys.filter((d) => d <= startDay).at(-1) ?? keys[0])!];
  }));
  const totals = days.map((day) => {
    let total = 0;
    let sold = 0;
    for (const [slug, sales] of byPlayer) {
      const price = sales.get(day);
      if (price !== undefined) { known.set(slug, price); sold++; }
      total += known.get(slug)!;
    }
    return { total, sold };
  });
  // Moyenne pondérée des jours précédents (poids décroissants) : un seul jour ne fait pas plonger la courbe.
  const weighted = totals.map((_, i) => {
    const window = totals.slice(Math.max(0, i - weightedDays + 1), i + 1).reverse();
    const weights = window.map((__, j) => weightedDays - j);
    return window.reduce((t, v, j) => t + v.total * weights[j], 0) / weights.reduce((a, b) => a + b, 0);
  });
  return days.map((day, i) => ({ day, value: weighted[i], raw: totals[i].total, players: totals[i].sold }));
}

/** Les deux courbes d'un effectif : cartes de la saison et cartes Classic. */
export const valueSeries = (prices: DailyPrice[]): ValueSeries => ({
  season: valueHistory(prices.filter((p) => p.inSeason)),
  classic: valueHistory(prices.filter((p) => !p.inSeason)),
});
