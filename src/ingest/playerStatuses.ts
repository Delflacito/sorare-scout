import type { Repo } from '@/db/repo';
import type { SorareClient } from '@/sources/sorare';
import { LEAGUES, seasonStart, type League } from './leagues';

export interface PlayerStatusesDeps { sorare: SorareClient; repo: Repo }

/**
 * Présent : club actuel (effectif Sorare), postes, statut de jeu, blessure, suspension, projection du prochain match,
 * photo et sélection de chaque joueur connu.
 */
export async function importPlayerStatuses(deps: PlayerStatusesDeps, leagues: League[] = LEAGUES): Promise<{ updated: number; errors: string[] }> {
  let updated = 0;
  const errors: string[] = [];
  const nationalTeams = new Map<string, number>();
  const listed: string[] = [];
  const season = new Date(seasonStart()).getUTCFullYear();
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
          const cardStatus = !p.limitedSeasons ? null : p.limitedSeasons.includes(season) ? 'in_season' as const : p.limitedSeasons.length ? 'classic' as const : 'none' as const;
          rows.push({ ...p, nationalTeamId, teamId: team.id, cardStatus });
          listed.push(p.slug);
        }
        updated += await deps.repo.updatePlayerStatuses(rows);
      } catch (e) {
        errors.push(`statuts ${team.sorareSlug} : ${(e as Error).message}`);
      }
    }
  }
  // Effectifs complets seulement : un club manquant ferait détacher ses joueurs à tort.
  if (!errors.length) await deps.repo.releasePlayersNotIn(listed);
  return { updated, errors };
}
