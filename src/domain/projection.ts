/** Observations à partir desquelles un indice adverse compte pour moitié (rétrécissement vers 1). */
export const SHRINK_K = 5;
export const POSITION_WEIGHT = 0.6;
export const TEAM_WEIGHT = 0.4;
export const HOME_FACTOR = 1.03;
export const AWAY_FACTOR = 0.97;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Ramène un indice (1 = moyenne de la ligue) vers 1 quand il repose sur peu d'observations. */
export function shrink(index: number | null, observations: number, k = SHRINK_K): number {
  if (index === null) return 1;
  return 1 + (index - 1) * (observations / (observations + k));
}

/** Forme : 0,6 × moyenne des 5 derniers matchs joués + 0,4 × moyenne des 15 (scores du plus récent au plus ancien). */
export function playerForm(scoresPlayed: number[]): number | null {
  if (!scoresPlayed.length) return null;
  return 0.6 * mean(scoresPlayed.slice(0, 5)) + 0.4 * mean(scoresPlayed.slice(0, 15));
}

export interface ProjectionInput {
  form: number;
  /** Concédé par l'adversaire au poste du joueur / moyenne de la ligue. */
  positionIndex: number | null;
  positionObs: number;
  /** Concédé par l'adversaire tous postes confondus / moyenne de la ligue. */
  teamIndex: number | null;
  teamObs: number;
  isHome: boolean;
}

/** Score potentiel si le joueur joue : forme × ajustement adversaire × domicile / extérieur, plafonné à 100. */
export function projectedScore(p: ProjectionInput): number {
  const opponent = POSITION_WEIGHT * shrink(p.positionIndex, p.positionObs) + TEAM_WEIGHT * shrink(p.teamIndex, p.teamObs);
  const raw = p.form * opponent * (p.isHome ? HOME_FACTOR : AWAY_FACTOR);
  return Math.round(Math.min(100, Math.max(0, raw)) * 10) / 10;
}
