import type { Repo, TeamRow, FixtureToComplete } from '@/db/repo';
import type { SorareClient, SorareGame } from '@/sources/sorare';
import { QuotaExhaustedError, type ApiFootballClient, type AfLineup } from '@/sources/apiFootball';
import { matchFixture, matchPlayer, type FixtureKey } from '@/domain/matching';
import { detailedPosition } from '@/domain/positions';
import { LEAGUES, type League } from './leagues';

export interface FixturesDeps { sorare: SorareClient; apiFootball: ApiFootballClient; repo: Repo }
export interface FixturesResult { fixturesImported: number; status: 'ok' | 'quota_exhausted'; errors: string[] }

/** Minutes au-delà desquelles un joueur non retrouvé dans la compo est considéré titulaire. */
const UNMATCHED_STARTER_MINUTES = 60;

async function syncLeague(deps: FixturesDeps, league: League, season: number): Promise<void> {
  const competitionId = await deps.repo.upsertCompetition({ slug: league.sorareSlug, name: league.name, apifootballId: league.apifootballId });
  const teams = await deps.repo.teamsByCompetition(competitionId);
  const bySlug = new Map(teams.map((t) => [t.sorareSlug, t]));

  const games = new Map<string, SorareGame>();
  for (const team of teams) for (const g of await deps.sorare.clubGames(team.sorareSlug)) games.set(g.id, g);

  const stored: (Omit<FixtureKey, 'id'> & { id: number })[] = [];
  for (const g of games.values()) {
    const home = bySlug.get(g.homeClubSlug);
    const away = bySlug.get(g.awayClubSlug);
    if (!home || !away) continue; // match de coupe ou hors compétition
    const id = await deps.repo.upsertFixture({
      date: g.date, competitionId, homeTeamId: home.id, awayTeamId: away.id,
      homeGoals: g.homeGoals, awayGoals: g.awayGoals, status: g.status, sorareGameId: g.id,
    });
    stored.push({ id, date: g.date, homeTeamId: String(home.id), awayTeamId: String(away.id) });
  }

  const byAfId = new Map(teams.filter((t) => t.apifootballId !== null).map((t) => [t.apifootballId!, t]));
  const candidates: FixtureKey[] = [];
  for (const f of await deps.apiFootball.fixtures(league.apifootballId, season)) {
    const home = byAfId.get(f.homeTeamId);
    const away = byAfId.get(f.awayTeamId);
    if (home && away) candidates.push({ id: String(f.id), date: f.date, homeTeamId: String(home.id), awayTeamId: String(away.id) });
  }
  for (const s of stored) {
    const afId = matchFixture(s, candidates);
    if (afId) await deps.repo.setFixtureApiFootballId(s.id, Number(afId));
  }
}

/** Importe compos et scores d'un match. Renvoie false si les données ne sont pas encore publiées. */
async function completeFixture(deps: FixturesDeps, fixture: FixtureToComplete, teamsById: Map<number, TeamRow>): Promise<boolean> {
  const lineups = await deps.apiFootball.lineups(fixture.apifootballFixtureId);
  if (!lineups.length) return false;
  const scores = await deps.sorare.gameScores(fixture.sorareGameId);
  if (!scores.length) return false;

  const home = teamsById.get(fixture.homeTeamId)!;
  const away = teamsById.get(fixture.awayTeamId)!;
  const lineupOf = (team: TeamRow): AfLineup | undefined => lineups.find((l) => l.teamId === team.apifootballId);

  await deps.repo.transaction(async (tx) => {
    const known = await tx.knownPlayerIds(scores.map((s) => s.playerSlug));
    for (const s of scores) {
      const team = s.clubSlug === home.sorareSlug ? home : s.clubSlug === away.sorareSlug ? away : undefined;
      if (!team) continue;
      const lineup = lineupOf(team);
      const roster = (lineup?.players ?? []).map((p) => ({ id: String(p.playerId), name: p.name }));
      const knownId = known.get(s.playerSlug);
      const afId = knownId && roster.some((r) => r.id === String(knownId)) ? String(knownId) : matchPlayer(s.displayName, roster);
      const inLineup = lineup?.players.find((p) => String(p.playerId) === afId);

      const playerId = await tx.upsertPlayer({
        name: s.displayName, sorareSlug: s.playerSlug, apifootballId: afId ? Number(afId) : null, position: s.position, teamId: team.id,
      });
      if (!inLineup && s.minutes > 0) {
        await tx.addUnmatched({ source: 'sorare', externalId: s.playerSlug, name: s.displayName, club: s.clubSlug, fixtureId: fixture.id });
      }
      await tx.upsertAppearance({
        fixtureId: fixture.id, playerId, teamId: team.id,
        grid: inLineup?.grid ?? null,
        detailedPosition: inLineup?.started ? detailedPosition(lineup!.formation, inLineup.grid) : null,
        started: inLineup ? inLineup.started : s.minutes >= UNMATCHED_STARTER_MINUTES,
        minutes: s.minutes, score: s.score, decisive: s.decisive, allAround: s.allAround,
      });
    }
    await tx.markLineupsImported(fixture.id, lineupOf(home)?.formation ?? null, lineupOf(away)?.formation ?? null);
  });
  return true;
}

export async function importFixtures(deps: FixturesDeps, season: number, leagues: League[] = LEAGUES): Promise<FixturesResult> {
  let fixturesImported = 0;
  const errors: string[] = [];
  try {
    for (const league of leagues) await syncLeague(deps, league, season);
    const teamsById = new Map((await deps.repo.allTeams()).map((t) => [t.id, t]));
    for (const fixture of await deps.repo.fixturesNeedingLineups()) {
      try {
        if (await completeFixture(deps, fixture, teamsById)) fixturesImported++;
      } catch (e) {
        if (e instanceof QuotaExhaustedError) throw e;
        errors.push(`match ${fixture.sorareGameId} : ${(e as Error).message}`);
      }
    }
  } catch (e) {
    if (e instanceof QuotaExhaustedError) return { fixturesImported, status: 'quota_exhausted', errors };
    throw e;
  }
  return { fixturesImported, status: 'ok', errors };
}
