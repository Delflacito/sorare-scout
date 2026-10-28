import type { Repo } from '@/db/repo';
import type { SorareClient } from '@/sources/sorare';
import { LEAGUES, type League } from './leagues';

export interface PlayerStatusesDeps { sorare: SorareClient; repo: Repo }

/** Présent : statut de jeu, blessure, suspension, projection du prochain match et photo de chaque joueur connu. */
export async function importPlayerStatuses(deps: PlayerStatusesDeps, leagues: League[] = LEAGUES): Promise<{ updated: number; errors: string[] }> {
  let updated = 0;
  const errors: string[] = [];
  for (const league of leagues) {
    const competitionId = await deps.repo.upsertCompetition({ slug: league.sorareSlug, name: league.name });
    for (const team of await deps.repo.teamsByCompetition(competitionId)) {
      try {
        updated += await deps.repo.updatePlayerStatuses(await deps.sorare.clubPlayers(team.sorareSlug));
      } catch (e) {
        errors.push(`statuts ${team.sorareSlug} : ${(e as Error).message}`);
      }
    }
  }
  return { updated, errors };
}
