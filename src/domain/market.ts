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
 */
function features(r: Profile, m: Omit<PriceModel, 'coef' | 'clubs'>): number[] {
  const age = ((r.age ?? m.meanAge) - m.meanAge) / 5;
  return [
    1, r.l15 / 10, (r.l5 - r.l15) / 10, r.startRate, r.allAround / 10, r.minutes / 90, age, age * age,
    r.clubPpg ?? AVG_PPG, r.prevGoalsAssists / 10, r.international ? 1 : 0,
    r.status === 'STARTER' ? 1 : 0, r.status === 'SUBSTITUTE' || r.status === 'NOT_PLAYING' ? 1 : 0,
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

export interface DailyPrice { slug: string; day: string; price: number }
/** Jours glissants sur lesquels le prix de chaque joueur est lissé. */
export const SMOOTH_DAYS = 3;
/** Jours de la moyenne pondérée de la courbe : le jour même pèse WEIGHTED_DAYS, la veille un de moins, etc. */
export const WEIGHTED_DAYS = 7;
export interface ValuePoint { day: string; value: number; players: number }

/**
 * Évolution de la valeur d'un effectif, chaînée jour par jour comme un indice : d'un jour au suivant, variation des prix
 * médians des joueurs vendus les deux jours ; le dernier jour vaut `current` (valeur estimée actuelle).
 * Jours écartés : moins de 3 joueurs vendus, ou moins de la moitié du jour le plus fourni (seuil plafonné à 20 joueurs, assez
 * pour un championnat entier) : une vente isolée fausserait la courbe.
 */
export function valueHistory(prices: DailyPrice[], current: number, weightedDays = WEIGHTED_DAYS): ValuePoint[] {
  // Prix de chaque joueur un jour donné : médiane de ses prix médians des SMOOTH_DAYS derniers jours (lisse le bruit quotidien).
  const dayMs = 86_400_000;
  const byPlayer = new Map<string, { t: number; price: number }[]>();
  for (const p of prices) byPlayer.set(p.slug, [...(byPlayer.get(p.slug) ?? []), { t: Date.parse(p.day), price: p.price }]);
  const byDay = new Map<string, Map<string, number>>();
  for (const p of prices) {
    const t = Date.parse(p.day);
    const recent = byPlayer.get(p.slug)!.filter((x) => x.t <= t && x.t > t - SMOOTH_DAYS * dayMs).map((x) => x.price);
    byDay.set(p.day, (byDay.get(p.day) ?? new Map()).set(p.slug, median(recent)!));
  }
  const most = Math.max(0, ...[...byDay.values()].map((m) => m.size));
  const days = [...byDay.keys()].filter((d) => byDay.get(d)!.size >= Math.max(3, Math.min(most / 2, 20))).sort();
  if (!days.length) return [];
  const values = new Array<number>(days.length);
  values[days.length - 1] = current;
  for (let i = days.length - 1; i > 0; i--) {
    const now = byDay.get(days[i])!;
    const before = byDay.get(days[i - 1])!;
    const common = [...now.keys()].filter((s) => before.has(s));
    const sumNow = common.reduce((t, s) => t + now.get(s)!, 0);
    const sumBefore = common.reduce((t, s) => t + before.get(s)!, 0);
    values[i - 1] = sumNow && sumBefore ? values[i] * (sumBefore / sumNow) : values[i];
  }
  // Moyenne pondérée des jours précédents (poids décroissants) pour qu'un seul jour ne fasse pas plonger la courbe,
  // puis remise à l'échelle : le dernier point reste la valeur estimée actuelle.
  const weighted = values.map((_, i) => {
    const window = values.slice(Math.max(0, i - weightedDays + 1), i + 1).reverse();
    const weights = window.map((__, j) => weightedDays - j);
    return window.reduce((t, v, j) => t + v * weights[j], 0) / weights.reduce((a, b) => a + b, 0);
  });
  const scale = weighted.at(-1) ? current / weighted.at(-1)! : 1;
  return days.map((day, i) => ({ day, value: weighted[i] * scale, players: byDay.get(day)!.size }));
}
