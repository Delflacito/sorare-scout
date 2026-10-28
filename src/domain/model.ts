// Modèle de score potentiel paramétrable, réglé par le test sur le passé (scripts/tune.ts).

/** Score décisif de base (niveau 0) : seul l'excédent au-dessus de 35 dépend du rapport de force. */
const DECISIVE_FLOOR = 35;

export interface GameRecord { score: number; decisive: number; allAround: number; home: boolean }

/** Concédé par l'adversaire au poste (total, All-Around, décisif) et moyennes de la ligue à ce poste. */
export interface PositionStats {
  total: number | null; aa: number | null; decisive: number | null; obs: number;
  leagueTotal: number | null; leagueAA: number | null; leagueDecisive: number | null;
}

/** Buts marqués / encaissés par match (équipe du joueur, adversaire, moyenne de la ligue) et effet du lieu sur les buts. */
export interface GoalStats {
  teamFor: number; teamAgainst: number; oppFor: number; oppAgainst: number; league: number; homeFactor: number; awayFactor: number;
}

export type Window = 5 | 10;

export interface PlayerFeatures {
  /** Matchs joués, du plus récent au plus ancien. */
  history: GameRecord[];
  /** Gardien ou défenseur : le décisif dépend surtout du clean sheet. */
  defensive: boolean;
  isHome: boolean;
  leagueVenue: { home: number; away: number };
  position: Record<Window, PositionStats | null>;
  overall: Record<Window, { index: number | null; obs: number } | null>;
  goals: GoalStats | null;
}

export interface ModelParams {
  /** total : score global × adversaire ; split : All-Around ajusté, décisif inchangé ; split+match : décisif selon le rapport de force. */
  model: 'total' | 'split' | 'split+match';
  baseGames: number;
  shrinkK: number;
  positionWeight: number;
  amplification: number;
  positionWindow: Window;
  overallWindow: Window;
  decisiveAmp: number;
}

/** Réglage actuel du site. */
export const DEFAULT_PARAMS: ModelParams = {
  model: 'total', baseGames: 15, shrinkK: 5, positionWeight: 0.4, amplification: 1, positionWindow: 5, overallWindow: 10, decisiveAmp: 1,
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const shrink = (index: number | null, obs: number, k: number) => (index === null ? 1 : 1 + (index - 1) * (obs / (obs + k)));
const ratio = (a: number | null, b: number | null) => (a !== null && b ? a / b : null);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Buts attendus pour l'équipe du joueur et contre elle dans ce match. */
export function matchGoals(g: GoalStats, isHome: boolean): { forTeam: number; againstTeam: number } {
  return {
    forTeam: g.league * (g.teamFor / g.league) * (g.oppAgainst / g.league) * (isHome ? g.homeFactor : g.awayFactor),
    againstTeam: g.league * (g.oppFor / g.league) * (g.teamAgainst / g.league) * (isHome ? g.awayFactor : g.homeFactor),
  };
}

/** Score potentiel (s'il joue) selon le modèle et les paramètres. */
export function predict(f: PlayerFeatures, p: ModelParams): number | null {
  const h = f.history.slice(0, p.baseGames);
  if (!h.length) return null;
  const base = mean(h.map((g) => g.score));

  const atVenue = h.filter((g) => g.home === f.isHome);
  const leagueVenue = f.isHome ? f.leagueVenue.home : f.leagueVenue.away;
  const venue = atVenue.length && base > 0
    ? (atVenue.length * (mean(atVenue.map((g) => g.score)) / base) + p.shrinkK * leagueVenue) / (atVenue.length + p.shrinkK)
    : leagueVenue;

  const pos = f.position[p.positionWindow];
  const ov = f.overall[p.overallWindow];
  const opponent = (positionIndex: number | null) =>
    Math.max(0, 1 + p.amplification * (
      p.positionWeight * shrink(positionIndex, pos?.obs ?? 0, p.shrinkK)
      + (1 - p.positionWeight) * shrink(ov?.index ?? null, ov?.obs ?? 0, p.shrinkK) - 1));

  let projected: number;
  if (p.model === 'total') {
    projected = base * opponent(ratio(pos?.total ?? null, pos?.leagueTotal ?? null)) * venue;
  } else {
    const aa = mean(h.map((g) => g.allAround)) * opponent(ratio(pos?.aa ?? null, pos?.leagueAA ?? null));
    let decisive = mean(h.map((g) => g.decisive));
    if (p.model === 'split+match' && f.goals && decisive > DECISIVE_FLOOR) {
      const g = matchGoals(f.goals, f.isHome);
      // Défenseurs / gardiens : probabilité de clean sheet rapportée à celle de leur équipe ; autres : buts attendus de l'équipe.
      const strength = f.defensive ? Math.exp(f.goals.teamAgainst - g.againstTeam) : g.forTeam / f.goals.teamFor;
      decisive = DECISIVE_FLOOR + (decisive - DECISIVE_FLOOR) * clamp(1 + p.decisiveAmp * (strength - 1), 0.3, 3);
    }
    projected = (decisive + aa) * venue;
  }
  return clamp(projected, 0, 100);
}
