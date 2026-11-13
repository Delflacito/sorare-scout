/** Observations à partir desquelles une moyenne ou un indice compte pour moitié (rétrécissement). */
export const SHRINK_K = 5;
/** Matchs joués retenus pour le niveau de base du joueur (L15). */
export const BASE_GAMES = 15;
/** En dessous de ce nombre de matchs joués, les matchs manquants comptent pour le score AA moyen du poste. */
export const MIN_BASE_GAMES = 5;
/** Matchs joués retenus pour la fréquence des actions décisives (plus rares, donc estimées sur plus longtemps). */
export const DECISIVE_GAMES = 40;
/**
 * Matchs à partir desquels le score décisif propre au joueur compte pour moitié face à celui de son poste.
 * Réglé sur 5 256 titulaires (octobre 2026) : erreur 15,18 contre 15,51 pour le L15, corrélation 0,192 contre 0,177.
 */
export const DECISIVE_SHRINK_K = 20;
/** Dans l'effet adversaire : concédé au poste vs qualité générale. */
export const POSITION_WEIGHT = 0.4;
export const TEAM_WEIGHT = 0.6;
/**
 * Amplification de l'effet adversaire. Réglée par le test sur le passé (5 journées, 4 612 titulaires) :
 * ×1 donne la meilleure corrélation avec les scores réels ; ×2 exagérait les écarts.
 */
export const OPPONENT_AMPLIFICATION = 1;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Ramène un indice (1 = moyenne de la ligue) vers 1 quand il repose sur peu d'observations. */
export function shrink(index: number | null, observations: number, k = SHRINK_K): number {
  if (index === null) return 1;
  return 1 + (index - 1) * (observations / (observations + k));
}

/** Ramène une valeur vers une référence quand elle repose sur peu d'observations. */
export function shrinkTowards(value: number | null, reference: number, observations: number, k = SHRINK_K): number {
  if (value === null) return reference;
  return (observations * value + k * reference) / (observations + k);
}

/**
 * Niveau de base (matchs joués, du plus récent au plus ancien, absences exclues) = score All-Around + score décisif attendus.
 * - AA : moyenne des 15 derniers matchs ; avec moins de MIN_BASE_GAMES matchs, complétée par l'AA moyen du poste.
 * - Décisif : moyenne des 40 derniers matchs ramenée vers celle du poste (k = 20), car un but isolé ne fait pas
 *   d'un défenseur un buteur régulier.
 */
export function baseScore(played: { decisive: number; allAround: number }[], reference: { decisive: number; allAround: number }): number | null {
  if (!played.length) return null;
  const aa = played.slice(0, BASE_GAMES).map((g) => g.allAround);
  const aaPadded = [...aa, ...Array(Math.max(0, MIN_BASE_GAMES - aa.length)).fill(reference.allAround)];
  const decisive = played.slice(0, DECISIVE_GAMES).map((g) => g.decisive);
  return mean(aaPadded) + shrinkTowards(mean(decisive), reference.decisive, decisive.length, DECISIVE_SHRINK_K);
}

/**
 * Effet du lieu propre au joueur : sa moyenne à domicile (ou à l'extérieur) rapportée à son niveau de base,
 * ramenée vers l'avantage du terrain mesuré dans le championnat tant qu'il a peu de matchs à ce lieu.
 */
export function playerVenueFactor(p: { venueAverage: number | null; venueGames: number; base: number | null; leagueFactor: number }): number {
  if (p.venueAverage === null || !p.base) return p.leagueFactor;
  return shrinkTowards(p.venueAverage / p.base, p.leagueFactor, p.venueGames);
}

export interface OpponentInput {
  /** Score moyen concédé par l'adversaire au poste, nombre d'observations, moyenne de la ligue à ce poste. */
  positionAverage: number | null;
  positionObs: number;
  positionLeagueAverage: number | null;
  /** Concédé par l'adversaire tous postes confondus / moyenne de la ligue. */
  teamIndex: number | null;
  teamObs: number;
}

/** Effet adversaire (1 = adversaire moyen) : 40 % concédé au poste + 60 % qualité générale, écart amplifié. */
export function opponentMultiplier(p: OpponentInput, amplification = OPPONENT_AMPLIFICATION): number {
  const positionIndex = p.positionAverage !== null && p.positionLeagueAverage ? p.positionAverage / p.positionLeagueAverage : null;
  const combined = POSITION_WEIGHT * shrink(positionIndex, p.positionObs) + TEAM_WEIGHT * shrink(p.teamIndex, p.teamObs);
  return Math.max(0, 1 + amplification * (combined - 1));
}

/** Score potentiel s’il joue : L15 × lieu × adversaire, plafonné à 100. */
export function projectedScore(p: { base: number | null; venueFactor: number; opponent: number }): number | null {
  if (p.base === null) return null;
  return Math.round(Math.min(100, Math.max(0, p.base * p.venueFactor * p.opponent)) * 10) / 10;
}

/** Note de qualité défensive de 1 à 100 dans le championnat : 100 = équipe qui concède le moins. */
export function qualityRatings(teams: { teamId: string; average: number }[]): Map<string, number> {
  if (teams.length === 1) return new Map([[teams[0].teamId, 50]]);
  // Note selon le nombre d'équipes qui concèdent plus : les ex aequo reçoivent la même note.
  return new Map(
    teams.map((t) => [t.teamId, Math.round(1 + (99 * teams.filter((o) => o.average > t.average).length) / (teams.length - 1))]),
  );
}

/** Avantage du terrain mesuré : moyenne des titulaires à domicile (ou à l'extérieur) / moyenne générale. */
export function venueFactors(obs: { home: boolean; score: number }[]): { home: number; away: number; observations: number } {
  const home = obs.filter((o) => o.home).map((o) => o.score);
  const away = obs.filter((o) => !o.home).map((o) => o.score);
  if (!home.length || !away.length) return { home: 1, away: 1, observations: obs.length };
  const all = mean(obs.map((o) => o.score));
  return { home: mean(home) / all, away: mean(away) / all, observations: obs.length };
}

export interface PlayerProjectionBase {
  base: number | null;
  homeAvg: number | null;
  homeGames: number;
  awayAvg: number | null;
  awayGames: number;
}
export interface FixtureContext {
  isHome: boolean;
  /** Avantage du terrain mesuré dans le championnat pour ce lieu. */
  leagueVenueFactor: number;
  position: { average: number | null; leagueAverage: number | null; observations: number } | null;
  overall: { index: number | null; observations: number } | null;
  /** Club du joueur dans le premier tiers (ou quart) de son championnat : bonus fixe. */
  topClub?: boolean;
}

/** Les joueurs des clubs du haut de tableau dépassent leur score potentiel d'environ 2 points (test sur le passé, nov. 2026). */
export const TOP_CLUB_BONUS = 2;

/** Score potentiel d'un joueur pour un match donné, avec ses deux composantes (utilisé par le site et le test sur le passé). */
export function projectForFixture(p: PlayerProjectionBase, f: FixtureContext, amplification = OPPONENT_AMPLIFICATION) {
  const venueFactor = playerVenueFactor({
    venueAverage: f.isHome ? p.homeAvg : p.awayAvg,
    venueGames: f.isHome ? p.homeGames : p.awayGames,
    base: p.base,
    leagueFactor: f.leagueVenueFactor,
  });
  const opponent = opponentMultiplier({
    positionAverage: f.position?.average ?? null, positionObs: f.position?.observations ?? 0,
    positionLeagueAverage: f.position?.leagueAverage ?? null,
    teamIndex: f.overall?.index ?? null, teamObs: f.overall?.observations ?? 0,
  }, amplification);
  const raw = projectedScore({ base: p.base, venueFactor, opponent });
  const projected = raw === null || !f.topClub ? raw : Math.min(100, Math.round((raw + TOP_CLUB_BONUS) * 10) / 10);
  return { venueFactor, opponent, projected };
}
