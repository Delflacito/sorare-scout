import type postgres from 'postgres';
import { describeDb, freshDb } from '../helpers/db';
import type { Repo } from '@/db/repo';

describeDb('repo', () => {
  let sql: postgres.Sql;
  let repo: Repo;
  beforeEach(async () => ({ sql, repo } = await freshDb()));
  afterEach(() => sql.end());

  async function seedFixture() {
    const competitionId = await repo.upsertCompetition({ slug: 'ligue-1-fr', name: 'Ligue 1', apifootballId: 61 });
    const home = await repo.upsertTeam({ name: 'PSG', sorareSlug: 'psg', apifootballId: 85, competitionId });
    const away = await repo.upsertTeam({ name: 'OM', sorareSlug: 'om', apifootballId: 81, competitionId });
    const fixtureId = await repo.upsertFixture({
      date: '2026-10-25T19:00:00Z', competitionId, homeTeamId: home, awayTeamId: away,
      homeGoals: 2, awayGoals: 1, status: 'played', sorareGameId: 'g1',
    });
    const playerId = await repo.upsertPlayer({ name: 'Nuno Mendes', sorareSlug: 'nuno-mendes', position: 'Defender', teamId: home });
    return { competitionId, home, away, fixtureId, playerId };
  }

  it('upsertTeam idempotent sur sorare_slug', async () => {
    const competitionId = await repo.upsertCompetition({ slug: 'l1', name: 'Ligue 1', apifootballId: 61 });
    const a = await repo.upsertTeam({ name: 'PSG', sorareSlug: 'psg', apifootballId: 85, competitionId });
    const b = await repo.upsertTeam({ name: 'Paris SG', sorareSlug: 'psg', apifootballId: 85, competitionId });
    expect(b).toBe(a);
    const [{ count }] = await sql`select count(*)::int as count from teams`;
    expect(count).toBe(1);
  });

  it('upsertPlayer conserve apifootball_id déjà connu', async () => {
    const { home } = await seedFixture();
    await repo.upsertPlayer({ name: 'Nuno Mendes', sorareSlug: 'nuno-mendes', apifootballId: 42, position: 'Defender', teamId: home });
    await repo.upsertPlayer({ name: 'Nuno Mendes', sorareSlug: 'nuno-mendes', position: 'Defender', teamId: home });
    const [p] = await sql`select apifootball_id from players`;
    expect(p.apifootball_id).toBe(42);
  });

  it('upsertAppearance idempotent', async () => {
    const { fixtureId, playerId, home } = await seedFixture();
    const app = { fixtureId, playerId, teamId: home, grid: '2:1', detailedPosition: 'LB' as const, started: true, minutes: 90, score: 60, decisive: 20, allAround: 40 };
    await repo.upsertAppearance(app);
    await repo.upsertAppearance({ ...app, score: 65 });
    const rows = await sql`select sorare_score from appearances`;
    expect(rows).toHaveLength(1);
    expect(rows[0].sorare_score).toBe(65);
  });

  it('poste précis invalide rejeté', async () => {
    const { fixtureId, home } = await seedFixture();
    await expect(sql`insert into appearances (fixture_id, player_id, team_id, detailed_position, started) values (${fixtureId}, 1, ${home}, 'XX', true)`).rejects.toThrow();
  });

  it('fixturesNeedingLineups et markLineupsImported', async () => {
    const { fixtureId } = await seedFixture();
    expect(await repo.fixturesNeedingLineups()).toEqual([]);
    await repo.setFixtureApiFootballId(fixtureId, 1001);
    expect(await repo.fixturesNeedingLineups()).toEqual([{ id: fixtureId, apifootballFixtureId: 1001 }]);
    await repo.markLineupsImported(fixtureId, '4-3-3', '4-4-2');
    expect(await repo.fixturesNeedingLineups()).toEqual([]);
  });

  it('transaction annulée en cas d’erreur', async () => {
    const { home, competitionId } = await seedFixture();
    await expect(repo.transaction(async (tx) => {
      await tx.upsertPlayer({ name: 'X', sorareSlug: 'x', position: 'Forward', teamId: home });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    const rows = await sql`select 1 from players where sorare_slug = 'x'`;
    expect(rows).toHaveLength(0);
    expect(competitionId).toBeGreaterThan(0);
  });

  it('addUnmatched sans doublon', async () => {
    const { fixtureId } = await seedFixture();
    const u = { source: 'sorare' as const, externalId: 'theo-hernandez', name: 'Theo Hernández', club: 'om', fixtureId };
    await repo.addUnmatched(u);
    await repo.addUnmatched(u);
    const rows = await sql`select * from unmatched_players`;
    expect(rows).toHaveLength(1);
  });

  it('import_runs', async () => {
    const id = await repo.startRun();
    await repo.finishRun(id, 'quota_exhausted', 3, ['quota']);
    const [r] = await sql`select status, fixtures_imported, errors from import_runs`;
    expect(r).toMatchObject({ status: 'quota_exhausted', fixtures_imported: 3, errors: ['quota'] });
  });

  it('replaceConceded remplace les lignes', async () => {
    const { home } = await seedFixture();
    const row = { teamId: String(home), position: 'LB' as const, window: 5, average: 60, leagueAverage: 50, index: 1.2, observations: 4, lowSample: false };
    await repo.replaceConceded([row]);
    await repo.replaceConceded([{ ...row, average: 70 }]);
    const rows = await sql`select average from team_conceded_by_position`;
    expect(rows).toEqual([{ average: 70 }]);
  });
});
