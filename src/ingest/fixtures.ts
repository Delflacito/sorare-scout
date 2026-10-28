import type { Repo, TeamRow, FixtureToComplete } from '@/db/repo';
import type { SorareClient, SorareGame, SorareTeam, SorareTeamLineup } from '@/sources/sorare';
import { formationOf, lineupPositions } from '@/domain/positions';
import { LEAGUES, type League } from './leagues';

export interface FixturesDeps { sorare: SorareClient; repo: Repo }
export interface FixturesResult { fixturesImported: number; errors: string[] }
export interface FixturesOptions {
  /** Heure (ms) après laquelle on ne complète plus de match : le reste sera repris au prochain import. */
  deadline?: number;
  /** Début de période (ISO) : les matchs antérieurs ne sont ni importés ni conservés. */
  since?: string;
  /** Matchs complétés en parallèle (Sorare répond lentement, mais autorise 200 requêtes / minute). */
  concurrency?: number;
}

const isPast = (g: SorareGame, since?: string) => !!since && Date.parse(g.date) < Date.parse(since);

/** Matchs du championnat ; renvoie les matchs des clubs dans les autres compétitions (coupes, Europe). */
async function syncLeague(deps: FixturesDeps, league: League, errors: string[], since?: string): Promise<SorareGame[]> {
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

  const others: SorareGame[] = [];
  for (const g of games.values()) {
    if (isPast(g, since)) continue; // saison précédente
    if (g.competitionSlug && g.competitionSlug !== league.sorareSlug) {
      others.push(g);
      continue;
    }
    const home = bySlug.get(g.homeClubSlug);
    const away = bySlug.get(g.awayClubSlug);
    if (!home || !away) continue;
    await deps.repo.upsertFixture({
      date: g.date, competitionId, homeTeamId: home.id, awayTeamId: away.id,
      homeGoals: g.homeGoals, awayGoals: g.awayGoals, status: g.status, sorareGameId: g.id,
    });
  }
  return others;
}

/**
 * Matchs joués hors championnat (coupes, Europe, sélections) : ils comptent pour les joueurs, pas pour les équipes.
 * Les matchs à venir de ces compétitions ne sont pas enregistrés (pas de score potentiel hors championnat).
 */
async function syncOtherGames(deps: FixturesDeps, games: SorareGame[], leagueSlugs: Set<string>): Promise<void> {
  const teamIds = new Map((await deps.repo.allTeams()).map((t) => [t.sorareSlug, t.id]));
  const competitionIds = new Map<string, number>();
  const teamId = async (t: SorareTeam) => {
    let id = teamIds.get(t.slug);
    if (id === undefined) {
      id = await deps.repo.ensureTeam({ name: t.name, sorareSlug: t.slug, pictureUrl: t.pictureUrl, kind: t.kind });
      teamIds.set(t.slug, id);
    }
    return id;
  };
  for (const g of games) {
    if (g.status !== 'played' || !g.competitionSlug || leagueSlugs.has(g.competitionSlug)) continue;
    let competitionId = competitionIds.get(g.competitionSlug);
    if (competitionId === undefined) {
      competitionId = await deps.repo.upsertCompetition({ slug: g.competitionSlug, name: g.competitionName ?? g.competitionSlug, isLeague: false });
      competitionIds.set(g.competitionSlug, competitionId);
    }
    await deps.repo.upsertFixture({
      date: g.date, competitionId, homeTeamId: await teamId(g.home), awayTeamId: await teamId(g.away),
      homeGoals: g.homeGoals, awayGoals: g.awayGoals, status: g.status, sorareGameId: g.id,
    });
  }
}

/** Matchs des sélections nationales des joueurs connus. */
async function nationalGames(deps: FixturesDeps, errors: string[], since?: string): Promise<SorareGame[]> {
  const games: SorareGame[] = [];
  for (const team of await deps.repo.nationalTeamsOfPlayers()) {
    try {
      games.push(...(await deps.sorare.nationalTeamGames(team.sorareSlug)).filter((g) => !isPast(g, since)));
    } catch (e) {
      errors.push(`sélection ${team.sorareSlug} : ${(e as Error).message}`);
    }
  }
  return games;
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
  const places = new Map(detail.scores.filter((s) => s.formationPlace).map((s) => [s.playerSlug, s.formationPlace!]));
  const sides = [
    { team: teamsById.get(fixture.homeTeamId)!, lineup: detail.home },
    { team: teamsById.get(fixture.awayTeamId)!, lineup: detail.away },
  ].map((s) => ({
    ...s,
    positions: lineupPositions(s.lineup.starting, places),
    grid: gridOf(s.lineup),
    members: new Set([...s.lineup.starting.flat(), ...s.lineup.bench].map((p) => p.slug)),
  }));

  await deps.repo.transaction(async (tx) => {
    // Joueurs d'une équipe non suivie (adversaire européen, sélection) : seulement ceux déjà connus, sans changer leur club.
    const known = await tx.playerIdsBySlugs(detail.scores.map((s) => s.playerSlug));
    for (const s of detail.scores) {
      const side = sides.find((x) => x.members.has(s.playerSlug));
      if (!side) continue; // pas sur la feuille de match
      const playerId = side.team.tracked
        ? await tx.upsertPlayer({ name: s.displayName, sorareSlug: s.playerSlug, position: s.position, teamId: side.team.id })
        : known.get(s.playerSlug);
      if (playerId === undefined) continue;
      await tx.upsertAppearance({
        fixtureId: fixture.id, playerId, teamId: side.team.id,
        grid: side.grid.get(s.playerSlug) ?? null,
        detailedPosition: side.positions.get(s.playerSlug) ?? null,
        started: side.grid.has(s.playerSlug),
        minutes: s.minutes, score: s.score, decisive: s.decisive, allAround: s.allAround, actions: s.actions,
      });
    }
    await tx.markLineupsImported(fixture.id, formationOf(detail.home.starting), formationOf(detail.away.starting));
  });
  return true;
}

export async function importFixtures(deps: FixturesDeps, leagues: League[] = LEAGUES, opts: FixturesOptions = {}): Promise<FixturesResult> {
  let fixturesImported = 0;
  const errors: string[] = [];
  if (opts.since) await deps.repo.deleteFixturesBefore(opts.since);
  const others = new Map<string, SorareGame>();
  for (const league of leagues) {
    try {
      for (const g of await syncLeague(deps, league, errors, opts.since)) others.set(g.id, g);
    } catch (e) {
      errors.push(`ligue ${league.name} : ${(e as Error).message}`);
    }
  }
  try {
    for (const g of await nationalGames(deps, errors, opts.since)) others.set(g.id, g);
    await syncOtherGames(deps, [...others.values()], new Set(LEAGUES.concat(leagues).map((l) => l.sorareSlug)));
  } catch (e) {
    errors.push(`autres compétitions : ${(e as Error).message}`);
  }
  const teamsById = new Map((await deps.repo.allTeams()).map((t) => [t.id, t]));
  // Du plus récent au plus ancien : la forme récente est disponible dès le premier import.
  const queue = await deps.repo.fixturesNeedingLineups(leagues.filter((l) => l.priority).map((l) => l.sorareSlug));
  const worker = async () => {
    for (let fixture = queue.shift(); fixture; fixture = queue.shift()) {
      if (opts.deadline !== undefined && Date.now() > opts.deadline) return;
      try {
        if (await completeFixture(deps, fixture, teamsById)) fixturesImported++;
      } catch (e) {
        await deps.repo.countLineupAttempt(fixture.id);
        errors.push(`match ${fixture.sorareGameId} : ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 1 }, worker));
  return { fixturesImported, errors };
}
