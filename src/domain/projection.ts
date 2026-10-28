/** Observations à partir desquelles une moyenne ou un indice compte pour moitié (rétrécissement). */
export const SHRINK_K = 5;
/** Matchs joués retenus pour le niveau de base du joueur (L15). */
export const BASE_GAMES = 15;
/** Dans l'effet adversaire : concédé au poste vs qualité générale. */
export const POSITION_WEIGHT = 0.4;
export const TEAM_WEIGHT = 0.6;
/** Amplification de l'effet adversaire (2 : un adversaire à −10 % fait baisser le score de 20 %). */
export const OPPONENT_AMPLIFICATION = 2;

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

/** Niveau de base : L15 sur les matchs joués (scores du plus récent au plus ancien, absences exclues). */
export function baseScore(scoresPlayed: number[]): number | null {
  return scoresPlayed.length ? mean(scoresPlayed.slice(0, BASE_GAMES)) : null;
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
export function opponentMultiplier(p: OpponentInput): number {
  const positionIndex = p.positionAverage !== null && p.positionLeagueAverage ? p.positionAverage / p.positionLeagueAverage : null;
  const combined = POSITION_WEIGHT * shrink(positionIndex, p.positionObs) + TEAM_WEIGHT * shrink(p.teamIndex, p.teamObs);
  return Math.max(0, 1 + OPPONENT_AMPLIFICATION * (combined - 1));
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
