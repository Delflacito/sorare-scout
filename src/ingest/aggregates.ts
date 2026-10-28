import type { Repo, CompletedFixture, AppearanceRow, PlayerSummaryRow, ConcededOverallRow, VenueFactorRow } from '@/db/repo';
import { concededByPosition, concededOverall, lastN, playingTime, scoreBreakdown, type Conceded, type ConcededObs, type TeamGame, type PlayerGame } from '@/domain/metrics';
import type { DetailedPosition } from '@/domain/types';
import { BASE_GAMES, baseScore, projectForFixture, qualityRatings, venueFactors } from '@/domain/projection';

export const CONCEDED_WINDOWS = [5, 10];
const USUAL_POSITION_SAMPLE = 10;

const byDateDesc = (a: { date: string }, b: { date: string }) => Date.parse(b.date) - Date.parse(a.date);
const isLeague = (f: CompletedFixture) => (f.scope ?? 'league') === 'league';

/** Concédé, qualité adverse et avantage du terrain : championnats uniquement (les coupes et sélections n'y entrent pas). */
function conceded(
  allFixtures: CompletedFixture[],
  apps: AppearanceRow[],
): { byPosition: Conceded[]; overall: ConcededOverallRow[]; venues: VenueFactorRow[] } {
  const fixtures = allFixtures.filter(isLeague);
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));
  const rows: Conceded[] = [];
  const overall: ConcededOverallRow[] = [];
  const venues: VenueFactorRow[] = [];
  const competitions = new Set(fixtures.map((f) => f.competitionId));
  for (const competitionId of competitions) {
    const compFixtures = fixtures.filter((f) => f.competitionId === competitionId).sort(byDateDesc);
    const teamFixtures: Record<string, string[]> = {};
    for (const f of compFixtures) {
      for (const t of [f.homeTeamId, f.awayTeamId]) (teamFixtures[String(t)] ??= []).push(String(f.id));
    }
    const obs: ConcededObs[] = [];
    for (const a of apps) {
      const f = fixtureById.get(a.fixtureId);
      if (!f || f.competitionId !== competitionId || !a.detailedPosition) continue;
      obs.push({
        opponentTeamId: String(a.teamId === f.homeTeamId ? f.awayTeamId : f.homeTeamId),
        fixtureId: String(f.id), date: f.date, position: a.detailedPosition, score: a.score, started: a.started,
      });
    }
    for (const w of CONCEDED_WINDOWS) {
      rows.push(...concededByPosition(obs, teamFixtures, w));
      const teams = concededOverall(obs, teamFixtures, w);
      const ratings = qualityRatings(teams.filter((t) => t.average !== null).map((t) => ({ teamId: t.teamId, average: t.average! })));
      overall.push(...teams.map((t) => ({ ...t, rating: ratings.get(t.teamId) ?? null })));
    }
    const starters = apps.filter((a) => a.started && fixtureById.get(a.fixtureId)?.competitionId === competitionId);
    const v = venueFactors(starters.map((a) => ({ home: a.teamId === fixtureById.get(a.fixtureId)!.homeTeamId, score: a.score })));
    venues.push({ competitionId, ...v });
  }
  return { byPosition: rows, overall, venues };
}

/**
 * Matchs d'équipe à prendre en compte pour un joueur : pour chaque club, de sa première participation pour ce club
 * jusqu'à sa première participation pour le club suivant (les matchs d'avant son arrivée ne comptent pas).
 * Matchs de sélection : seulement ceux où il figure sur la feuille de match.
 */
function playerTeamGames(apps: AppearanceRow[], fixtureById: Map<number, CompletedFixture>, fixturesByTeam: Map<number, CompletedFixture[]>): TeamGame[] {
  const national = apps.filter((a) => fixtureById.get(a.fixtureId)!.scope === 'national');
  const nationalGames = national.map((a) => ({ fixtureId: String(a.fixtureId), date: fixtureById.get(a.fixtureId)!.date, teamId: String(a.teamId) }));
  const stints: { teamId: number; from: number }[] = [];
  const sorted = apps.filter((a) => fixtureById.get(a.fixtureId)!.scope !== 'national').sort((a, b) => Date.parse(fixtureById.get(a.fixtureId)!.date) - Date.parse(fixtureById.get(b.fixtureId)!.date));
  for (const a of sorted) {
    if (stints.at(-1)?.teamId !== a.teamId) stints.push({ teamId: a.teamId, from: Date.parse(fixtureById.get(a.fixtureId)!.date) });
  }
  const clubGames = stints.flatMap((s, i) => {
    const from = s.from;
    const to = stints[i + 1]?.from ?? Infinity;
    return (fixturesByTeam.get(s.teamId) ?? [])
      .filter((f) => f.scope !== 'national' && Date.parse(f.date) >= from && Date.parse(f.date) < to)
      .map((f) => ({ fixtureId: String(f.id), date: f.date, teamId: String(s.teamId) }));
  });
  return [...clubGames, ...nationalGames];
}

function usualPosition(apps: AppearanceRow[], fixtureById: Map<number, CompletedFixture>): DetailedPosition | null {
  const recent = apps
    .filter((a) => a.started && a.detailedPosition)
    .sort((a, b) => byDateDesc(fixtureById.get(a.fixtureId)!, fixtureById.get(b.fixtureId)!))
    .slice(0, USUAL_POSITION_SAMPLE);
  const counts = new Map<DetailedPosition, number>();
  for (const a of recent) counts.set(a.detailedPosition!, (counts.get(a.detailedPosition!) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Niveau de base (L15 joués) et moyennes à domicile / à l'extérieur sur ces mêmes matchs. */
function baseAndVenue(apps: AppearanceRow[], fixtureById: Map<number, CompletedFixture>) {
  const played = apps
    .filter((a) => a.minutes > 0)
    .sort((a, b) => byDateDesc(fixtureById.get(a.fixtureId)!, fixtureById.get(b.fixtureId)!))
    .slice(0, BASE_GAMES);
  const isHome = (a: AppearanceRow) => fixtureById.get(a.fixtureId)!.homeTeamId === a.teamId;
  const avg = (xs: AppearanceRow[]) => (xs.length ? xs.reduce((t, a) => t + a.score, 0) / xs.length : null);
  const home = played.filter(isHome);
  const away = played.filter((a) => !isHome(a));
  return {
    base: baseScore(played.map((a) => a.score)),
    homeAvg: avg(home), homeGames: home.length, awayAvg: avg(away), awayGames: away.length,
  };
}

function summaries(fixtures: CompletedFixture[], apps: AppearanceRow[]): PlayerSummaryRow[] {
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));
  const fixturesByTeam = new Map<number, CompletedFixture[]>();
  for (const f of fixtures) for (const t of [f.homeTeamId, f.awayTeamId]) fixturesByTeam.set(t, [...(fixturesByTeam.get(t) ?? []), f]);
  const byPlayer = new Map<number, AppearanceRow[]>();
  for (const a of apps) byPlayer.set(a.playerId, [...(byPlayer.get(a.playerId) ?? []), a]);

  return [...byPlayer.entries()].map(([playerId, playerApps]) => {
    const games = playerTeamGames(playerApps, fixtureById, fixturesByTeam);
    const played: PlayerGame[] = playerApps.map((a) => ({
      fixtureId: String(a.fixtureId), started: a.started, minutes: a.minutes, score: a.score, decisive: a.decisive, allAround: a.allAround,
    }));
    const l5 = lastN(games, played, 5);
    const pt5 = playingTime(games, played, 5);
    const pt15 = playingTime(games, played, 15);
    const b5 = scoreBreakdown(games, played, 5);
    const b15 = scoreBreakdown(games, played, 15);
    return {
      playerId, l5: l5.average, l15: lastN(games, played, 15).average, l40: lastN(games, played, 40).average, stdDev5: l5.stdDev,
      startRate5: pt5.startRate, avgMinutes5: pt5.avgMinutes, startRate15: pt15.startRate, avgMinutes15: pt15.avgMinutes,
      decisive5: b5.decisive, allAround5: b5.allAround, decisive15: b15.decisive, allAround15: b15.allAround,
      usualPosition: usualPosition(playerApps, fixtureById),
      ...baseAndVenue(playerApps, fixtureById),
    };
  });
}

/** Calcule tous les agrégats à partir de matchs complets (fonction pure, réutilisée par le test sur le passé). */
export function computeAggregates(fixtures: CompletedFixture[], appearances: AppearanceRow[]) {
  return { ...conceded(fixtures, appearances), summaries: summaries(fixtures, appearances) };
}

export type Aggregates = ReturnType<typeof computeAggregates>;
export interface FixtureSide { isHome: boolean; opponentId: number; competitionId: number }

/**
 * Score potentiel d'un joueur pour un match à partir des agrégats : concédé au poste (5 derniers matchs),
 * qualité générale (10 derniers matchs), avantage du terrain du championnat. Même calcul que la fiche joueur.
 */
export function projector(agg: Aggregates, amplification?: number) {
  const byPosition = new Map(agg.byPosition.filter((c) => c.window === 5).map((c) => [`${c.teamId}|${c.position}`, c]));
  const leagueAtPosition = new Map<DetailedPosition, number[]>();
  for (const c of agg.byPosition) {
    if (c.window === 5 && c.leagueAverage !== null) leagueAtPosition.set(c.position, [...(leagueAtPosition.get(c.position) ?? []), c.leagueAverage]);
  }
  const mean = (xs: number[] | undefined) => (xs?.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const overall = new Map(agg.overall.filter((c) => c.window === 10).map((c) => [c.teamId, c]));
  const venues = new Map(agg.venues.map((v) => [v.competitionId, v]));
  return (s: PlayerSummaryRow, f: FixtureSide) => {
    if (s.base === null || !s.usualPosition) return null;
    const opp = String(f.opponentId);
    const pos = byPosition.get(`${opp}|${s.usualPosition}`);
    const all = overall.get(opp);
    const venue = venues.get(f.competitionId);
    return projectForFixture(s, {
      isHome: f.isHome,
      leagueVenueFactor: venue ? (f.isHome ? venue.home : venue.away) : 1,
      position: { average: pos?.average ?? null, leagueAverage: pos?.leagueAverage ?? mean(leagueAtPosition.get(s.usualPosition)), observations: pos?.observations ?? 0 },
      overall: all ? { index: all.index, observations: all.observations } : null,
    }, amplification);
  };
}

/** Prochain match de championnat de chaque joueur (selon son club actuel) et score potentiel associé. */
export function withNextProjection(
  agg: Aggregates,
  playerTeams: Map<number, number>,
  nextFixtures: Map<number, FixtureSide & { fixtureId: number }>,
): PlayerSummaryRow[] {
  const project = projector(agg);
  return agg.summaries.map((s) => {
    const team = playerTeams.get(s.playerId);
    const next = team === undefined ? undefined : nextFixtures.get(team);
    if (!next) return { ...s, nextFixtureId: null, nextProjected: null };
    return { ...s, nextFixtureId: next.fixtureId, nextProjected: project(s, next)?.projected ?? null };
  });
}

/** Recalcule team_conceded_by_position et player_summary à partir des matchs complets. */
export async function recomputeAggregates(repo: Repo): Promise<{ conceded: number; players: number }> {
  const { fixtures, appearances } = await repo.aggregateInputs();
  const agg = computeAggregates(fixtures, appearances);
  const { summaries: _, ...concededRows } = agg;
  const summaryRows = withNextProjection(agg, await repo.playerTeams(), await repo.nextLeagueFixtures());
  await repo.transaction(async (tx) => {
    await tx.replaceConceded(concededRows.byPosition);
    await tx.replaceConcededOverall(concededRows.overall);
    await tx.replaceVenueFactors(concededRows.venues);
    await tx.replacePlayerSummaries(summaryRows);
  });
  return { conceded: concededRows.byPosition.length, players: summaryRows.length };
}
