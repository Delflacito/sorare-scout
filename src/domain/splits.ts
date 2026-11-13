/**
 * Profil d'un joueur selon le lieu (domicile / extérieur) et le niveau de l'adversaire au classement actuel,
 * sur les matchs de championnat de la saison. Les commentaires ne ressortent que pour des écarts nets.
 */

/** Un match joué (minutes > 0) en championnat, avec le rang actuel de l'adversaire dans un championnat de `teams` clubs. */
export interface SplitGame { isHome: boolean; rank: number; teams: number; score: number; decisive: number; allAround: number }

/** Moyennes d'un groupe de matchs. */
export interface SplitCell { games: number; score: number; decisive: number; allAround: number }

export interface Tier { index: number; from: number; to: number }

export type Venue = 'home' | 'away';
export type Metric = 'score' | 'allAround' | 'decisive';

export interface SplitNote {
  tone: 'up' | 'down';
  metric: Metric;
  text: string;
  /** Effet sur le prochain match : favorable, défavorable ou sans lien. */
  next: 'good' | 'bad' | null;
}

export interface PlayerSplits {
  /** Nombre de clubs du championnat (celui du dernier match joué) : fixe le découpage en tranches. */
  teams: number;
  tiers: Tier[];
  overall: SplitCell;
  venue: Record<Venue, SplitCell | null>;
  /** Par tranche (index), tous lieux confondus. */
  byTier: (SplitCell | null)[];
  /** Par tranche et par lieu. */
  cells: Record<Venue, SplitCell | null>[];
  /** Contexte du prochain match de championnat, s'il est connu. */
  next: { venue: Venue; tier: number } | null;
  notes: SplitNote[];
}

/** En dessous, une moyenne n'est pas commentée (et la case est grisée). */
export const MIN_GAMES = 3;

/**
 * Tailles des tranches : 4 quarts à partir de 20 clubs, sinon 3 tiers ; le reste va d'abord aux tranches du milieu
 * (16 clubs : 5 / 6 / 5 ; 18 : 6 / 6 / 6 ; 20 : 5 / 5 / 5 / 5).
 */
export function tierSizes(teams: number): number[] {
  const k = teams >= 20 ? 4 : 3;
  const sizes = Array<number>(k).fill(Math.floor(teams / k));
  const middleFirst = k === 3 ? [1, 0, 2] : [1, 2, 0, 3];
  for (let r = 0; r < teams % k; r++) sizes[middleFirst[r]]++;
  return sizes;
}

export function tiersOf(teams: number): Tier[] {
  let from = 1;
  return tierSizes(teams).map((size, index) => {
    const t = { index, from, to: from + size - 1 };
    from += size;
    return t;
  });
}

export function tierOf(rank: number, teams: number): number {
  return tiersOf(teams).findIndex((t) => rank >= t.from && rank <= t.to);
}

const TIER_NAMES: Record<number, string[]> = {
  3: ['haut de tableau', 'milieu de tableau', 'bas de tableau'],
  4: ['haut de tableau', 'milieu haut', 'milieu bas', 'bas de tableau'],
};
/** « haut de tableau (1-6) ». */
export const tierName = (tiers: Tier[], i: number) => `${TIER_NAMES[tiers.length][i]} (${tiers[i].from}-${tiers[i].to})`;
export const TIER_SHORT: Record<number, string[]> = { 3: ['Haut', 'Milieu', 'Bas'], 4: ['Haut', 'Milieu +', 'Milieu −', 'Bas'] };

function cell(games: SplitGame[]): SplitCell | null {
  if (!games.length) return null;
  const avg = (f: (g: SplitGame) => number) => games.reduce((t, g) => t + f(g), 0) / games.length;
  return { games: games.length, score: avg((g) => g.score), decisive: avg((g) => g.decisive), allAround: avg((g) => g.allAround) };
}

/** Écart minimal (points) pour commenter : lieu contre lieu, tranche contre moyenne, case contre moyenne. */
const THRESHOLD: Record<Metric, { venue: number; tier: number; cell: number }> = {
  score: { venue: 10, tier: 10, cell: 12 },
  allAround: { venue: 7, tier: 7, cell: 8 },
  decisive: { venue: 8, tier: 8, cell: 10 },
};
// L'AA fait la base des gros scores : à écart égal, il passe devant.
const PRIORITY: Record<Metric, number> = { score: 1, allAround: 1.2, decisive: 1 };
const MAX_NOTES = 3;

const PLACE: Record<Venue, string> = { home: 'à domicile', away: 'à l’extérieur' };
const fmt = (x: number) => String(Math.round(x));
const games = (c: SplitCell) => `${c.games} m.`;

function phrase(metric: Metric, tone: 'up' | 'down', where: string): string {
  const head = {
    score: tone === 'up' ? 'Très fort' : 'En difficulté',
    allAround: tone === 'up' ? 'AA élevé' : 'AA faible',
    decisive: tone === 'up' ? 'Décisif' : 'Peu décisif',
  }[metric];
  return `${head} ${where}`;
}

interface Candidate extends SplitNote { weight: number; venue?: Venue; tier?: number }

/** Commentaires : écarts nets seulement, les plus marqués d'abord, sans redire un écart déjà couvert. */
export function splitNotes(s: Omit<PlayerSplits, 'notes'>): SplitNote[] {
  const out: Candidate[] = [];
  const nextGood = (venue?: Venue, tier?: number, tone?: 'up' | 'down') => {
    if (!s.next) return null;
    if ((venue !== undefined && venue !== s.next.venue) || (tier !== undefined && tier !== s.next.tier)) return null;
    return tone === 'up' ? 'good' : 'bad';
  };
  for (const metric of ['score', 'allAround', 'decisive'] as Metric[]) {
    const { home, away } = s.venue;
    if (home && away && home.games >= MIN_GAMES && away.games >= MIN_GAMES) {
      const diff = home[metric] - away[metric];
      if (Math.abs(diff) >= THRESHOLD[metric].venue) {
        const [best, worst]: Venue[] = diff > 0 ? ['home', 'away'] : ['away', 'home'];
        const b = s.venue[best]!, w = s.venue[worst]!;
        out.push({
          tone: 'up', metric, venue: best, weight: (Math.abs(diff) / THRESHOLD[metric].venue) * PRIORITY[metric],
          text: `${phrase(metric, 'up', PLACE[best])} (${fmt(b[metric])}, ${games(b)}), bien moins ${PLACE[worst]} (${fmt(w[metric])}, ${games(w)})`,
          next: s.next ? (s.next.venue === best ? 'good' : 'bad') : null,
        });
      }
    }
    const vsAverage = (c: SplitCell | null, kind: 'tier' | 'cell', where: string, venue?: Venue, tier?: number) => {
      if (!c || c.games < MIN_GAMES || c.games === s.overall.games) return;
      const diff = c[metric] - s.overall[metric];
      if (Math.abs(diff) < THRESHOLD[metric][kind]) return;
      const tone = diff > 0 ? 'up' : 'down';
      out.push({
        tone, metric, venue, tier, weight: (Math.abs(diff) / THRESHOLD[metric][kind]) * PRIORITY[metric],
        text: `${phrase(metric, tone, where)} : ${fmt(c[metric])} de moyenne (${games(c)}), contre ${fmt(s.overall[metric])} en général`,
        next: nextGood(venue, tier, tone),
      });
    };
    s.byTier.forEach((c, i) => vsAverage(c, 'tier', `contre le ${tierName(s.tiers, i)}`, undefined, i));
    s.cells.forEach((byVenue, i) => (['home', 'away'] as Venue[]).forEach((v) =>
      vsAverage(byVenue[v], 'cell', `${PLACE[v]} contre le ${tierName(s.tiers, i)}`, v, i)));
  }
  const chosen: Candidate[] = [];
  for (const c of out.sort((a, b) => b.weight - a.weight)) {
    const covered = chosen.some((x) => x.metric === c.metric && x.tone === c.tone
      && ((x.venue && x.venue === c.venue) || (x.tier !== undefined && x.tier === c.tier)));
    if (!covered) chosen.push(c);
    if (chosen.length === MAX_NOTES) break;
  }
  return chosen.map(({ tone, metric, text, next }) => ({ tone, metric, text, next }));
}

/** Profil complet ; null sans match de championnat joué. */
export function playerSplits(all: SplitGame[], next: { isHome: boolean; rank: number; teams: number } | null): PlayerSplits | null {
  if (!all.length) return null;
  // shortcut: un joueur passé d'un championnat à un autre de taille différente ne garde que les matchs du dernier ; rare en cours de saison.
  const teams = all[all.length - 1].teams;
  const gs = all.filter((g) => g.teams === teams);
  const tiers = tiersOf(teams);
  const venueOf = (g: SplitGame): Venue => (g.isHome ? 'home' : 'away');
  const base = {
    teams, tiers,
    overall: cell(gs)!,
    venue: { home: cell(gs.filter((g) => g.isHome)), away: cell(gs.filter((g) => !g.isHome)) },
    byTier: tiers.map((t) => cell(gs.filter((g) => tierOf(g.rank, teams) === t.index))),
    cells: tiers.map((t) => ({
      home: cell(gs.filter((g) => venueOf(g) === 'home' && tierOf(g.rank, teams) === t.index)),
      away: cell(gs.filter((g) => venueOf(g) === 'away' && tierOf(g.rank, teams) === t.index)),
    })),
    next: next && next.teams === teams ? { venue: (next.isHome ? 'home' : 'away') as Venue, tier: tierOf(next.rank, teams) } : null,
  };
  return { ...base, notes: splitNotes(base) };
}

/** Moyenne du joueur dans le contexte de son prochain match (lieu et tranche de l'adversaire). */
export const nextCell = (s: PlayerSplits) => (s.next ? s.cells[s.next.tier][s.next.venue] : null);
export const contextLabel = (s: PlayerSplits) =>
  s.next ? `${s.next.venue === 'home' ? 'Dom.' : 'Ext.'} vs ${TIER_SHORT[s.tiers.length][s.next.tier].toLowerCase()}` : null;
