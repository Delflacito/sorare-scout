import type { Repo } from '@/db/repo';
import type { SorareClient } from '@/sources/sorare';
import { LEAGUES, type League } from './leagues';

export interface ClubsDeps { sorare: SorareClient; repo: Repo }

/** Clubs de chaque championnat ; les clubs qui n'y figurent plus (relégués) en sont détachés. */
export async function importClubs(deps: ClubsDeps, leagues: League[] = LEAGUES): Promise<{ clubs: number }> {
  let clubs = 0;
  for (const league of leagues) {
    const competitionId = await deps.repo.upsertCompetition({ slug: league.sorareSlug, name: league.name });
    const sorareClubs = await deps.sorare.clubs(league.sorareSlug);
    for (const club of sorareClubs) {
      await deps.repo.upsertTeam({ name: club.name, sorareSlug: club.slug, competitionId, pictureUrl: club.pictureUrl, shortName: club.shortName });
    }
    await deps.repo.detachTeams(competitionId, sorareClubs.map((c) => c.slug));
    clubs += sorareClubs.length;
  }
  return { clubs };
}
