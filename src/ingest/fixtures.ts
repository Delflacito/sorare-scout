import type { Repo, TeamRow, FixtureToComplete } from '@/db/repo';
import type { SorareClient, SorareGame, SorareTeamLineup } from '@/sources/sorare';
import { formationOf, lineupPositions } from '@/domain/positions';
import { LEAGUES, type League } from './leagues';

export interface FixturesDeps { sorare: SorareClient; repo: Repo }
export interface FixturesResult { fixturesImported: number; errors: string[] }

async function syncLeague(deps: FixturesDeps, league: League, errors: string[]): Promise<void> {
  const competitionId = await deps.repo.upsertCompetition({ slug: league.sorareSlug, name: league.name });
  const teams = await deps.repo.teamsByCompetition(competitionId);
  const bySlug = new Map(teams.map((t) => [t.sorareSlug, t]));

  const games = new Map<string, SorareGame>();
  for (const team of teams) {
    try {
      for (const g of await deps.sorare.clubGames(team.sorareSlug)) games.set(g.id, g);
    } catch (e) {
      errors.push(`club ${team.sorareSlug} : ${(e as Error).message}`);
    }
  }

  for (const g of games.values()) {
    const home = bySlug.get(g.homeClubSlug);
    const away = bySlug.get(g.awayClubSlug);
    if (!home || !away || (g.competitionSlug && g.competitionSlug !== league.sorareSlug)) continue; // coupe, Europe…
    await deps.repo.upsertFixture({
      date: g.date, competitionId, homeTeamId: home.id, awayTeamId: away.id,
      homeGoals: g.homeGoals, awayGoals: g.awayGoals, status: g.status, sorareGameId: g.id,
    });
  }
}

/** Position « ligne:colonne » de chaque titulaire (colonne 1 = côté droit, comme dans Sorare). */
function gridOf(lineup: SorareTeamLineup): Map<string, string> {
  const grid = new Map<string, string>();
  lineup.starting.forEach((row, r) => row.forEach((p, c) => grid.set(p.slug, `${r + 1}:${c + 1}`)));
  return grid;
}

/** Importe compos et scores d'un match. Renvoie false si Sorare ne les a pas encore publiés. */
async function completeFixture(deps: FixturesDeps, fixture: FixtureToComplete, teamsById: Map<number, TeamRow>): Promise<boolean> {
  const detail = await deps.sorare.gameDetail(fixture.sorareGameId);
  if (!detail.scores.length || (!detail.home.starting.length && !detail.away.starting.length)) {
    await deps.repo.countLineupAttempt(fixture.id);
    return false;
  }
  const sides = [
    { team: teamsById.get(fixture.homeTeamId)!, lineup: detail.home },
    { team: teamsById.get(fixture.awayTeamId)!, lineup: detail.away },
  ].map((s) => ({
    ...s,
    positions: lineupPositions(s.lineup.starting),
    grid: gridOf(s.lineup),
    members: new Set([...s.lineup.starting.flat(), ...s.lineup.bench].map((p) => p.slug)),
  }));

  await deps.repo.transaction(async (tx) => {
    for (const s of detail.scores) {
      const side = sides.find((x) => x.members.has(s.playerSlug));
      if (!side) continue; // pas sur la feuille de match
      const playerId = await tx.upsertPlayer({ name: s.displayName, sorareSlug: s.playerSlug, position: s.position, teamId: side.team.id });
      await tx.upsertAppearance({
        fixtureId: fixture.id, playerId, teamId: side.team.id,
        grid: side.grid.get(s.playerSlug) ?? null,
        detailedPosition: side.positions.get(s.playerSlug) ?? null,
        started: side.grid.has(s.playerSlug),
        minutes: s.minutes, score: s.score, decisive: s.decisive, allAround: s.allAround,
      });
    }
    await tx.markLineupsImported(fixture.id, formationOf(detail.home.starting), formationOf(detail.away.starting));
  });
  return true;
}

export async function importFixtures(deps: FixturesDeps, leagues: League[] = LEAGUES): Promise<FixturesResult> {
  let fixturesImported = 0;
  const errors: string[] = [];
  for (const league of leagues) {
    try {
      await syncLeague(deps, league, errors);
    } catch (e) {
      errors.push(`ligue ${league.name} : ${(e as Error).message}`);
    }
  }
  const teamsById = new Map((await deps.repo.allTeams()).map((t) => [t.id, t]));
  for (const fixture of await deps.repo.fixturesNeedingLineups()) {
    try {
      if (await completeFixture(deps, fixture, teamsById)) fixturesImported++;
    } catch (e) {
      await deps.repo.countLineupAttempt(fixture.id);
      errors.push(`match ${fixture.sorareGameId} : ${(e as Error).message}`);
    }
  }
  return { fixturesImported, errors };
}
