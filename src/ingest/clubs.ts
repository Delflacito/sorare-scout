import type { Repo } from '@/db/repo';
import type { SorareClient } from '@/sources/sorare';
import type { ApiFootballClient } from '@/sources/apiFootball';
import { matchClub, type Candidate } from '@/domain/matching';
import { LEAGUES, type League } from './leagues';

export interface ClubsDeps { sorare: SorareClient; apiFootball: ApiFootballClient; repo: Repo }
export interface UnmatchedClub { source: 'sorare' | 'apifootball'; name: string }

export async function importClubs(deps: ClubsDeps, season: number, leagues: League[] = LEAGUES) {
  let matched = 0;
  const unmatched: UnmatchedClub[] = [];
  for (const league of leagues) {
    const competitionId = await deps.repo.upsertCompetition({ slug: league.sorareSlug, name: league.name, apifootballId: league.apifootballId });
    const sorareClubs = await deps.sorare.clubs(league.sorareSlug);
    const afTeams = new Map<string, Candidate>();
    for (const f of await deps.apiFootball.fixtures(league.apifootballId, season)) {
      afTeams.set(String(f.homeTeamId), { id: String(f.homeTeamId), name: f.homeName });
      afTeams.set(String(f.awayTeamId), { id: String(f.awayTeamId), name: f.awayName });
    }
    const used = new Set<string>();
    for (const club of sorareClubs) {
      const afId = matchClub(club.name, [...afTeams.values()]);
      if (afId) {
        matched++;
        used.add(afId);
      } else {
        unmatched.push({ source: 'sorare', name: club.name });
      }
      await deps.repo.upsertTeam({ name: club.name, sorareSlug: club.slug, apifootballId: afId ? Number(afId) : null, competitionId });
    }
    for (const t of afTeams.values()) if (!used.has(t.id)) unmatched.push({ source: 'apifootball', name: t.name });
  }
  return { matched, unmatched };
}
