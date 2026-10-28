import type { Repo } from '@/db/repo';
import type { DetailedPosition, GenericPosition } from '@/domain/types';
import { recomputeAggregates } from '@/ingest/aggregates';

/**
 * Petit jeu de données : 3 équipes (PSG, OM, OL) en Ligue 1, 3 matchs joués, 1 match à venir PSG–OM (2099).
 * Renvoie les ids internes par clé.
 */
export async function seedLeague(repo: Repo): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};
  ids.l1 = await repo.upsertCompetition({ slug: 'ligue-1-fr', name: 'Ligue 1' });
  for (const [slug, name] of [['psg', 'Paris Saint-Germain'], ['om', 'Olympique de Marseille'], ['ol', 'Olympique Lyonnais']]) {
    ids[slug] = await repo.upsertTeam({ name, sorareSlug: slug, competitionId: ids.l1 });
  }
  const fixtures: [string, string, string, string][] = [
    ['g1', 'psg', 'ol', '2026-10-04'], ['g2', 'om', 'ol', '2026-10-11'], ['g3', 'ol', 'om', '2026-10-18'],
  ];
  for (const [id, h, a, d] of fixtures) {
    ids[id] = await repo.upsertFixture({ date: `${d}T20:00:00Z`, competitionId: ids.l1, homeTeamId: ids[h], awayTeamId: ids[a], homeGoals: 1, awayGoals: 0, status: 'played', sorareGameId: id });
    await repo.markLineupsImported(ids[id], '4-3-3', '4-3-3');
  }
  ids.next = await repo.upsertFixture({ date: '2099-01-01T20:00:00Z', competitionId: ids.l1, homeTeamId: ids.psg, awayTeamId: ids.om, homeGoals: null, awayGoals: null, status: 'scheduled', sorareGameId: 'g9' });
  const apps: [string, string, string, string, GenericPosition, DetailedPosition, number, boolean][] = [
    ['g1', 'nuno-mendes', 'Nuno Mendes', 'psg', 'Defender', 'LB', 70, true],
    ['g1', 'lacazette', 'Alexandre Lacazette', 'ol', 'Forward', 'ST', 30, true],
    ['g2', 'greenwood', 'Mason Greenwood', 'om', 'Forward', 'ST', 80, true],
    ['g2', 'tagliafico', 'Nicolás Tagliafico', 'ol', 'Defender', 'LB', 60, true],
    ['g3', 'tagliafico', 'Nicolás Tagliafico', 'ol', 'Defender', 'LB', 50, true],
    ['g3', 'greenwood', 'Mason Greenwood', 'om', 'Forward', 'ST', 40, false],
  ];
  for (const [g, slug, name, team, pos, dp, score, started] of apps) {
    ids[slug] = await repo.upsertPlayer({ name, sorareSlug: slug, position: pos, teamId: ids[team] });
    await repo.upsertAppearance({ fixtureId: ids[g], playerId: ids[slug], teamId: ids[team], grid: null, detailedPosition: started ? dp : null, started, minutes: started ? 90 : 20, score, decisive: score / 2, allAround: score / 2 });
  }
  await recomputeAggregates(repo);
  return ids;
}
