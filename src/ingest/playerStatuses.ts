import type { Repo } from '@/db/repo';
import type { SorareClient } from '@/sources/sorare';
import { LEAGUES, type League } from './leagues';

export interface PlayerStatusesDeps { sorare: SorareClient; repo: Repo }

/** Présent : statut de jeu, blessure, suspension, projection du prochain match, photo et sélection de chaque joueur connu. */
export async function importPlayerStatuses(deps: PlayerStatusesDeps, leagues: League[] = LEAGUES): Promise<{ updated: number; errors: string[] }> {
  let updated = 0;
  const errors: string[] = [];
  const nationalTeams = new Map<string, number>();
  for (const league of leagues) {
    const competitionId = await deps.repo.upsertCompetition({ slug: league.sorareSlug, name: league.name });
    for (const team of await deps.repo.teamsByCompetition(competitionId)) {
      try {
        const players = await deps.sorare.clubPlayers(team.sorareSlug);
        const rows = [];
        for (const p of players) {
          const nt = p.nationalTeam;
          let nationalTeamId: number | null = null;
          if (nt) {
            nationalTeamId = nationalTeams.get(nt.slug) ?? await deps.repo.ensureTeam({ name: nt.name, sorareSlug: nt.slug, pictureUrl: nt.pictureUrl, kind: 'national' });
            nationalTeams.set(nt.slug, nationalTeamId);
          }
          rows.push({ ...p, nationalTeamId });
        }
        updated += await deps.repo.updatePlayerStatuses(rows);
      } catch (e) {
        errors.push(`statuts ${team.sorareSlug} : ${(e as Error).message}`);
      }
    }
  }
  return { updated, errors };
}
