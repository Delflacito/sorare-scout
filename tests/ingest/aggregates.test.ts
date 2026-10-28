import type postgres from 'postgres';
import { describeDb, freshDb } from '../helpers/db';
import type { Repo } from '@/db/repo';
import { recomputeAggregates } from '@/ingest/aggregates';
import type { DetailedPosition, GenericPosition } from '@/domain/types';

describeDb('recomputeAggregates', () => {
  let sql: postgres.Sql;
  let repo: Repo;
  const ids: Record<string, number> = {};

  beforeEach(async () => {
    ({ sql, repo } = await freshDb());
    const competitionId = await repo.upsertCompetition({ slug: 'l1', name: 'Ligue 1' });
    for (const t of ['A', 'B', 'C']) ids[t] = await repo.upsertTeam({ name: t, sorareSlug: t, competitionId });
    const fixtures: [string, string, string, number][] = [['f1', 'A', 'B', 1], ['f2', 'C', 'A', 2], ['f3', 'B', 'C', 3]];
    for (const [id, h, a, day] of fixtures) {
      ids[id] = await repo.upsertFixture({
        date: `2026-10-0${day}T20:00:00Z`, competitionId, homeTeamId: ids[h], awayTeamId: ids[a],
        homeGoals: 0, awayGoals: 0, status: 'played', sorareGameId: id,
      });
      await repo.markLineupsImported(ids[id], '4-4-2', '4-4-2');
    }
    // match à venir : ne doit jamais compter
    await repo.upsertFixture({ date: '2026-10-09T20:00:00Z', competitionId, homeTeamId: ids.A, awayTeamId: ids.C, homeGoals: null, awayGoals: null, status: 'scheduled', sorareGameId: 'f4' });
    const apps: [string, string, string, GenericPosition, DetailedPosition, number][] = [
      ['f1', 'a1', 'A', 'Defender', 'LB', 60], ['f1', 'b1', 'B', 'Forward', 'ST', 40], ['f1', 'x', 'A', 'Midfielder', 'CM', 20],
      ['f2', 'c1', 'C', 'Defender', 'LB', 80], ['f2', 'a1', 'A', 'Defender', 'LB', 50],
      ['f3', 'b1', 'B', 'Forward', 'ST', 70], ['f3', 'c1', 'C', 'Defender', 'LB', 30], ['f3', 'x', 'C', 'Midfielder', 'CM', 50],
    ];
    for (const [f, p, t, pos, dp, score] of apps) {
      ids[p] = await repo.upsertPlayer({ name: p, sorareSlug: p, position: pos, teamId: ids[t] });
      await repo.upsertAppearance({ fixtureId: ids[f], playerId: ids[p], teamId: ids[t], grid: null, detailedPosition: dp, started: true, minutes: 90, score, decisive: 0, allAround: score });
    }
  });
  afterEach(() => sql.end());

  const conceded = (team: string, pos: string) =>
    sql`select average, league_average, observations, low_sample from team_conceded_by_position
        where team_id = ${ids[team]} and detailed_position = ${pos} and window_size = 5`.then((r) => r[0]);

  it('concédé par poste, fenêtres 5 et 10', async () => {
    await recomputeAggregates(repo);
    expect(await conceded('A', 'LB')).toEqual({ average: 80, league_average: 55, observations: 1, low_sample: true });
    expect(await conceded('B', 'LB')).toEqual({ average: 45, league_average: 55, observations: 2, low_sample: true });
    expect(await conceded('C', 'ST')).toMatchObject({ average: 70 });
    const [{ count }] = await sql`select count(*)::int as count from team_conceded_by_position where window_size = 10`;
    expect(count).toBeGreaterThan(0);
  });

  it('résumés joueurs : L5, titularisation, poste habituel', async () => {
    await recomputeAggregates(repo);
    const [a1] = await sql`select l5, start_rate5, usual_position from player_summary where player_id = ${ids.a1}`;
    expect(a1).toEqual({ l5: 55, start_rate5: 1, usual_position: 'LB' });
  });

  it('transfert : matchs de l’ancien club puis du nouveau', async () => {
    await recomputeAggregates(repo);
    const [x] = await sql`select l5, start_rate5 from player_summary where player_id = ${ids.x}`;
    expect(x.l5).toBeCloseTo(70 / 3);
    expect(x.start_rate5).toBeCloseTo(2 / 3);
  });

  it('arrivée en cours de saison : les matchs du club avant son arrivée ne comptent pas', async () => {
    const y = await repo.upsertPlayer({ name: 'y', sorareSlug: 'y', position: 'Forward', teamId: ids.B });
    await repo.upsertAppearance({ fixtureId: ids.f3, playerId: y, teamId: ids.B, grid: null, detailedPosition: 'ST', started: true, minutes: 90, score: 60, decisive: 0, allAround: 60 });
    await recomputeAggregates(repo);
    const [row] = await sql`select l5 from player_summary where player_id = ${y}`;
    expect(row.l5).toBe(60);
  });

  it('idempotent', async () => {
    await recomputeAggregates(repo);
    await recomputeAggregates(repo);
    const [{ count }] = await sql`select count(*)::int as count from player_summary`;
    expect(count).toBe(4);
  });
});
