import type { DetailedPosition } from './types';

export interface TeamGame {
  fixtureId: string;
  date: string;
  teamId: string;
}

export interface PlayerGame {
  fixtureId: string;
  started: boolean;
  minutes: number;
  score: number;
  decisive: number;
  allAround: number;
}

export interface ConcededObs {
  opponentTeamId: string;
  fixtureId: string;
  date: string;
  position: DetailedPosition;
  score: number;
  started: boolean;
}

export interface Conceded {
  teamId: string;
  position: DetailedPosition;
  window: number;
  average: number | null;
  leagueAverage: number | null;
  index: number | null;
  observations: number;
  lowSample: boolean;
}

export const LOW_SAMPLE_THRESHOLD = 3;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Les n matchs d'équipe les plus récents, chacun associé à la participation du joueur (ou absence). */
function recent(teamGames: TeamGame[], played: PlayerGame[], n: number): (PlayerGame | undefined)[] {
  const byFixture = new Map(played.map((p) => [p.fixtureId, p]));
  return [...teamGames]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, n)
    .map((g) => byFixture.get(g.fixtureId));
}

/** Moyenne des n dernières notes (matchs réellement joués) : un match sans jouer ne compte pas, comme le L5/L15 de Sorare. */
export function lastN(teamGames: TeamGame[], played: PlayerGame[], n: number) {
  const scores = recent(teamGames, played.filter((p) => p.minutes > 0), Infinity).filter((p) => p !== undefined).slice(0, n).map((p) => p.score);
  const average = mean(scores);
  const stdDev = Math.sqrt(mean(scores.map((s) => (s - average) ** 2)));
  return { average, stdDev, games: scores.length };
}

export function playingTime(teamGames: TeamGame[], played: PlayerGame[], n: number) {
  const games = recent(teamGames, played, n);
  return {
    startRate: mean(games.map((p) => (p?.started ? 1 : 0))),
    avgMinutes: mean(games.map((p) => p?.minutes ?? 0)),
  };
}

export function scoreBreakdown(teamGames: TeamGame[], played: PlayerGame[], n: number) {
  const games = recent(teamGames, played, n);
  return {
    decisive: mean(games.map((p) => p?.decisive ?? 0)),
    allAround: mean(games.map((p) => p?.allAround ?? 0)),
  };
}

/**
 * Pour chaque équipe (clé de teamFixtures, fixtureIds du plus récent au plus ancien), moyenne des scores des
 * titulaires adverses par poste sur ses `window` derniers matchs, comparée à la moyenne de la ligue pour ce poste.
 */
export function concededByPosition(obs: ConcededObs[], teamFixtures: Record<string, string[]>, window: number): Conceded[] {
  const groups = new Map<string, { teamId: string; position: DetailedPosition; scores: number[] }>();
  const leagueScores = new Map<DetailedPosition, number[]>();
  for (const [teamId, fixtures] of Object.entries(teamFixtures)) {
    const inWindow = new Set(fixtures.slice(0, window));
    for (const o of obs) {
      if (!o.started || o.opponentTeamId !== teamId || !inWindow.has(o.fixtureId)) continue;
      const key = `${teamId}|${o.position}`;
      const g = groups.get(key) ?? { teamId, position: o.position, scores: [] };
      g.scores.push(o.score);
      groups.set(key, g);
      leagueScores.set(o.position, [...(leagueScores.get(o.position) ?? []), o.score]);
    }
  }
  return [...groups.values()].map(({ teamId, position, scores }) => {
    const average = mean(scores);
    const leagueAverage = mean(leagueScores.get(position) ?? []);
    return {
      teamId,
      position,
      window,
      average,
      leagueAverage,
      index: leagueAverage === 0 ? null : average / leagueAverage,
      observations: scores.length,
      lowSample: scores.length < LOW_SAMPLE_THRESHOLD,
    };
  });
}

export interface ConcededOverall {
  teamId: string;
  window: number;
  average: number | null;
  leagueAverage: number | null;
  index: number | null;
  observations: number;
}

/** Comme concededByPosition, mais tous postes confondus : qualité défensive générale de l'équipe. */
export function concededOverall(obs: ConcededObs[], teamFixtures: Record<string, string[]>, window: number): ConcededOverall[] {
  const byTeam = new Map<string, number[]>();
  for (const [teamId, fixtures] of Object.entries(teamFixtures)) {
    const inWindow = new Set(fixtures.slice(0, window));
    const scores = obs.filter((o) => o.started && o.opponentTeamId === teamId && inWindow.has(o.fixtureId)).map((o) => o.score);
    if (scores.length) byTeam.set(teamId, scores);
  }
  const leagueAverage = mean([...byTeam.values()].flat());
  return [...byTeam.entries()].map(([teamId, scores]) => {
    const average = mean(scores);
    return { teamId, window, average, leagueAverage, index: leagueAverage === 0 ? null : average / leagueAverage, observations: scores.length };
  });
}

/** Seuils de régularité affichés (points Sorare). */
export const REGULARITY_THRESHOLDS = [40, 50, 60] as const;

/**
 * Régularité : part des n derniers matchs joués au-dessus de chaque seuil. Pour une streak, un joueur souvent à 50
 * vaut mieux qu'un joueur à 80 une fois sur trois. null sans match joué.
 */
export function regularity(scores: number[], thresholds: readonly number[] = REGULARITY_THRESHOLDS): { threshold: number; rate: number }[] | null {
  if (!scores.length) return null;
  return thresholds.map((t) => ({ threshold: t, rate: scores.filter((s) => s >= t).length / scores.length }));
}

export const AVERAGE_WINDOWS = [5, 10, 15, 20, 50] as const;

/**
 * L5…L50 de Sorare : moyenne des x derniers matchs joués (minutes > 0), du plus récent au plus ancien.
 * Fenêtre non remplie : moyenne des matchs disponibles ; aucun match joué → null.
 */
export function playedAverages(games: { score: number; minutes: number }[]) {
  const played = games.filter((g) => g.minutes > 0).map((g) => g.score);
  const avg = (n: number) => { const xs = played.slice(0, n); return xs.length ? mean(xs) : null; };
  return { l5: avg(5), l10: avg(10), l15: avg(15), l20: avg(20), l50: avg(50), played: played.length };
}
