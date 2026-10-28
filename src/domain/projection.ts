/** Observations à partir desquelles une moyenne ou un indice adverse compte pour moitié (rétrécissement). */
export const SHRINK_K = 5;
/** Part de la forme du joueur ; le reste vient du score atteignable contre l'adversaire au poste. */
export const FORM_WEIGHT = 0.3;
export const ACHIEVABLE_WEIGHT = 0.7;
/** Dans le score atteignable : concédé par l'adversaire au poste vs moyenne de la ligue au poste × qualité adverse. */
export const POSITION_WEIGHT = 0.4;
export const TEAM_WEIGHT = 0.6;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Ramène un indice (1 = moyenne de la ligue) vers 1 quand il repose sur peu d'observations. */
export function shrink(index: number | null, observations: number, k = SHRINK_K): number {
  if (index === null) return 1;
  return 1 + (index - 1) * (observations / (observations + k));
}

/** Ramène une moyenne vers une référence quand elle repose sur peu d'observations. */
export function shrinkTowards(value: number | null, reference: number, observations: number, k = SHRINK_K): number {
  if (value === null) return reference;
  return (observations * value + k * reference) / (observations + k);
}

/** Forme : 0,6 × moyenne des 5 derniers matchs joués + 0,4 × moyenne des 15 (scores du plus récent au plus ancien). */
export function playerForm(scoresPlayed: number[]): number | null {
  if (!scoresPlayed.length) return null;
  return 0.6 * mean(scoresPlayed.slice(0, 5)) + 0.4 * mean(scoresPlayed.slice(0, 15));
}

export interface AchievableInput {
  /** Score moyen concédé par l'adversaire au poste et nombre d'observations. */
  positionAverage: number | null;
  positionObs: number;
  /** Score moyen de la ligue à ce poste. */
  positionLeagueAverage: number | null;
  /** Concédé par l'adversaire tous postes confondus / moyenne de la ligue. */
  teamIndex: number | null;
  teamObs: number;
}

/** Score atteignable à ce poste contre cet adversaire, en points. */
export function achievableScore(p: AchievableInput): number | null {
  if (p.positionLeagueAverage === null) return null;
  const atPosition = shrinkTowards(p.positionAverage, p.positionLeagueAverage, p.positionObs);
  const byQuality = p.positionLeagueAverage * shrink(p.teamIndex, p.teamObs);
  return POSITION_WEIGHT * atPosition + TEAM_WEIGHT * byQuality;
}

/** Score potentiel s'il joue : 30 % forme + 70 % score atteignable, × facteur domicile / extérieur, plafonné à 100. */
export function projectedScore(p: { form: number | null; achievable: number | null; venueFactor: number }): number | null {
  const base =
    p.form !== null && p.achievable !== null ? FORM_WEIGHT * p.form + ACHIEVABLE_WEIGHT * p.achievable : (p.form ?? p.achievable);
  if (base === null) return null;
  return Math.round(Math.min(100, Math.max(0, base * p.venueFactor)) * 10) / 10;
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
