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

export function lastN(teamGames: TeamGame[], played: PlayerGame[], n: number) {
  const scores = recent(teamGames, played, n).map((p) => p?.score ?? 0);
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
