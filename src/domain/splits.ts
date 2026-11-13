/**
 * Profil d'un joueur selon le lieu (domicile / extérieur) et le niveau de l'adversaire au classement actuel,
 * sur les matchs de championnat de la saison. Les commentaires ne ressortent que pour des écarts nets.
 */

/** Un match joué (minutes > 0) en championnat, avec le rang actuel de l'adversaire dans un championnat de `teams` clubs. */
export interface SplitGame {
  isHome: boolean; rank: number; teams: number; score: number; decisive: number; allAround: number;
  /** Minutes jouées et actions décisives positives (hors clean sheet) ; clean sheet obtenu. Absents : 90 min, 0 action, pas de CS. */
  minutes?: number; actions?: number; cleanSheet?: boolean;
}

/** Moyennes d'un groupe de matchs. */
export interface SplitCell {
  games: number; score: number; allAround: number; /** Meilleur score du groupe. */ max: number;
  /** Indicateur décisif : % de clean sheets pour un gardien, actions décisives par 90 min sinon. */
  decisive: number;
}

export interface Tier { index: number; from: number; to: number }

export type Venue = 'home' | 'away';
export type Metric = 'score' | 'allAround' | 'decisive';

export interface SplitNote {
  tone: 'up' | 'down';
  metric: Metric;
  /** Forme courte : « AA D·T3 +14 » (écart à la moyenne du joueur). */
  tag: string;
  /** Détail au survol. */
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
  /** Gardien : l'indicateur décisif est le % de clean sheets. */
  goalkeeper: boolean;
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

function cell(games: SplitGame[], goalkeeper: boolean): SplitCell | null {
  if (!games.length) return null;
  const sum = (f: (g: SplitGame) => number) => games.reduce((t, g) => t + f(g), 0);
  const minutes = sum((g) => g.minutes ?? 90);
  const decisive = goalkeeper
    ? (100 * sum((g) => (g.cleanSheet ? 1 : 0))) / games.length
    : minutes ? (90 * sum((g) => g.actions ?? 0)) / minutes : 0;
  return { games: games.length, score: sum((g) => g.score) / games.length, allAround: sum((g) => g.allAround) / games.length, max: Math.max(...games.map((g) => g.score)), decisive };
}

/** « CS 40 % » (gardien) ou « AD/90 0.45 ». */
export const fmtDecisive = (goalkeeper: boolean, x: number) => (goalkeeper ? `CS ${Math.round(x)} %` : `AD/90 ${x.toFixed(2)}`);

/** Écart minimal à la moyenne du joueur (points) pour commenter : par lieu, par tranche, par case lieu × tranche. */
const THRESHOLD: Record<Metric, { venue: number; tier: number; cell: number }> = {
  score: { venue: 5, tier: 10, cell: 12 },
  allAround: { venue: 4, tier: 7, cell: 8 },
  decisive: { venue: 0.25, tier: 0.35, cell: 0.4 },
};
// Gardien : écart de % de clean sheets.
const KEEPER_DECISIVE = { venue: 20, tier: 25, cell: 30 };
// L'AA fait la base des gros scores : à écart égal, il passe devant.
const PRIORITY: Record<Metric, number> = { score: 1, allAround: 1.2, decisive: 1 };
const MAX_NOTES = 3;

export const METRIC_LABEL: Record<Metric, string> = { score: 'Score', allAround: 'AA', decisive: 'AD/90' };
const label = (metric: Metric, goalkeeper: boolean) => (metric === 'decisive' && goalkeeper ? 'CS' : METRIC_LABEL[metric]);
const PLACE: Record<Venue, string> = { home: 'à domicile', away: 'à l’extérieur' };
/** T1…T3 pour des tiers, Q1…Q4 pour des quarts ; 1 = haut du classement. */
export const tierCode = (tiers: Tier[], i: number) => `${tiers.length === 4 ? 'Q' : 'T'}${i + 1}`;
/** « dom.·T3 », « ext. », « T1 ». */
export const contextCode = (tiers: Tier[], venue?: Venue, tier?: number) =>
  [venue && (venue === 'home' ? 'dom.' : 'ext.'), tier !== undefined && tierCode(tiers, tier)].filter(Boolean).join('·');
const signed = (x: number, digits = 0) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(digits)}`;

interface Candidate extends SplitNote { weight: number; venue?: Venue; tier?: number }

/** Commentaires : écarts nets à la moyenne du joueur, les plus marqués d'abord, sans redire un écart déjà couvert. */
export function splitNotes(s: Omit<PlayerSplits, 'notes'>): SplitNote[] {
  const out: Candidate[] = [];
  for (const metric of ['score', 'allAround', 'decisive'] as Metric[]) {
    const push = (c: SplitCell | null, kind: 'venue' | 'tier' | 'cell', venue?: Venue, tier?: number) => {
      if (!c || c.games < MIN_GAMES || c.games === s.overall.games) return;
      const diff = c[metric] - s.overall[metric];
      const threshold = metric === 'decisive' && s.goalkeeper ? KEEPER_DECISIVE[kind] : THRESHOLD[metric][kind];
      if (Math.abs(diff) < threshold) return;
      const per90 = metric === 'decisive' && !s.goalkeeper;
      const unit = metric === 'decisive' && s.goalkeeper ? ' %' : '';
      const val = (x: number) => (per90 ? x.toFixed(2) : `${Math.round(x)}${unit}`);
      const tone = diff > 0 ? 'up' : 'down';
      const concerned = s.next && (venue === undefined || venue === s.next.venue) && (tier === undefined || tier === s.next.tier);
      const where = [venue && PLACE[venue], tier !== undefined && `contre le ${tierName(s.tiers, tier)}`].filter(Boolean).join(' ');
      out.push({
        tone, metric, venue, tier, weight: (Math.abs(diff) / threshold) * PRIORITY[metric],
        tag: `${label(metric, s.goalkeeper)} ${contextCode(s.tiers, venue, tier)} ${signed(diff, per90 ? 1 : 0)}${unit}`,
        text: `${label(metric, s.goalkeeper)} ${where} : ${val(c[metric])} sur ${c.games} m., contre ${val(s.overall[metric])} en moyenne`,
        next: concerned ? (tone === 'up' ? 'good' : 'bad') : null,
      });
    };
    push(s.venue.home, 'venue', 'home');
    push(s.venue.away, 'venue', 'away');
    s.byTier.forEach((c, i) => push(c, 'tier', undefined, i));
    s.cells.forEach((byVenue, i) => { push(byVenue.home, 'cell', 'home', i); push(byVenue.away, 'cell', 'away', i); });
  }
  const chosen: Candidate[] = [];
  for (const c of out.sort((a, b) => b.weight - a.weight)) {
    const covered = chosen.some((x) => x.metric === c.metric && (
      // domicile et extérieur sont les deux faces d'un même écart
      (x.tier === undefined && c.tier === undefined)
      || (x.tone === c.tone && ((x.venue && x.venue === c.venue) || (x.tier !== undefined && x.tier === c.tier)))));
    if (!covered) chosen.push(c);
    if (chosen.length === MAX_NOTES) break;
  }
  return chosen.map(({ tone, metric, tag, text, next }) => ({ tone, metric, tag, text, next }));
}

/** Profil complet ; null sans match de championnat joué. */
export function playerSplits(all: SplitGame[], next: { isHome: boolean; rank: number; teams: number } | null, goalkeeper = false): PlayerSplits | null {
  if (!all.length) return null;
  // shortcut: un joueur passé d'un championnat à un autre de taille différente ne garde que les matchs du dernier ; rare en cours de saison.
  const teams = all[all.length - 1].teams;
  const gs = all.filter((g) => g.teams === teams);
  const tiers = tiersOf(teams);
  const c = (xs: SplitGame[]) => cell(xs, goalkeeper);
  const venueOf = (g: SplitGame): Venue => (g.isHome ? 'home' : 'away');
  const base = {
    teams, tiers,
    overall: c(gs)!,
    venue: { home: c(gs.filter((g) => g.isHome)), away: c(gs.filter((g) => !g.isHome)) },
    byTier: tiers.map((t) => c(gs.filter((g) => tierOf(g.rank, teams) === t.index))),
    cells: tiers.map((t) => ({
      home: c(gs.filter((g) => venueOf(g) === 'home' && tierOf(g.rank, teams) === t.index)),
      away: c(gs.filter((g) => venueOf(g) === 'away' && tierOf(g.rank, teams) === t.index)),
    })),
    next: next && next.teams === teams ? { venue: (next.isHome ? 'home' : 'away') as Venue, tier: tierOf(next.rank, teams) } : null,
    goalkeeper,
  };
  return { ...base, notes: splitNotes(base) };
}

/** Moyenne du joueur dans le contexte de son prochain match (lieu et tranche de l'adversaire). */
export const nextCell = (s: PlayerSplits) => (s.next ? s.cells[s.next.tier][s.next.venue] : null);
export const contextLabel = (s: PlayerSplits) => (s.next ? contextCode(s.tiers, s.next.venue, s.next.tier) : null);

/** Classement (points, différence, buts marqués, puis id) de chaque championnat : clé `${competitionId}|${teamId}`. Même règle que la requête du site. */
export function standings(fixtures: { competitionId: number; homeTeamId: number; awayTeamId: number; homeGoals?: number | null; awayGoals?: number | null }[]) {
  const rows = new Map<string, { competitionId: number; teamId: number; pts: number; gd: number; gf: number }>();
  for (const f of fixtures) {
    if (f.homeGoals == null || f.awayGoals == null) continue;
    for (const [teamId, gf, ga] of [[f.homeTeamId, f.homeGoals, f.awayGoals], [f.awayTeamId, f.awayGoals, f.homeGoals]]) {
      const key = `${f.competitionId}|${teamId}`;
      const r = rows.get(key) ?? { competitionId: f.competitionId, teamId, pts: 0, gd: 0, gf: 0 };
      r.pts += gf > ga ? 3 : gf === ga ? 1 : 0;
      r.gd += gf - ga;
      r.gf += gf;
      rows.set(key, r);
    }
  }
  const out = new Map<string, { rank: number; teams: number }>();
  for (const c of new Set([...rows.values()].map((r) => r.competitionId))) {
    const table = [...rows.values()].filter((r) => r.competitionId === c)
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.teamId - b.teamId);
    table.forEach((r, i) => out.set(`${c}|${r.teamId}`, { rank: i + 1, teams: table.length }));
  }
  return out;
}
