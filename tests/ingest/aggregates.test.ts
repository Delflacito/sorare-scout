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

  it('concédé tous postes confondus et forme des joueurs', async () => {
    await recomputeAggregates(repo);
    // A concède : f1 b1 ST 40 (+ x CM 20 du côté A → non, x joue pour A) ; f2 c1 LB 80
    const [a] = await sql`select average, observations from team_conceded_overall where team_id = ${ids.A} and window_size = 5`;
    expect(a).toEqual({ average: 60, observations: 2 });
    // a1 : 60 à domicile (f1), 50 à l'extérieur (f2) → base L15 = 55
    const [s] = await sql`select base, home_avg, home_games, away_avg, away_games from player_summary where player_id = ${ids.a1}`;
    expect(s).toEqual({ base: 55, home_avg: 60, home_games: 1, away_avg: 50, away_games: 1 });
  });

  it('note de qualité défensive (1 à 100) et avantage du terrain mesuré', async () => {
    await recomputeAggregates(repo);
    const ratings = await sql`select t.sorare_slug, o.rating from team_conceded_overall o join teams t on t.id = o.team_id
      where o.window_size = 10 order by 1`;
    // concédé : A 60, B 40, C 60 → B meilleure défense
    expect(ratings).toEqual([{ sorare_slug: 'A', rating: 1 }, { sorare_slug: 'B', rating: 100 }, { sorare_slug: 'C', rating: 1 }]);
    const [v] = await sql`select home_factor, away_factor, observations from venue_factors`;
    // titulaires à domicile : 60, 20, 80, 70 (moy. 57,5) ; à l'extérieur : 40, 50, 30, 50 (42,5) ; tous : 50
    expect(v.home_factor).toBeCloseTo(1.15);
    expect(v.away_factor).toBeCloseTo(0.85);
    expect(v.observations).toBe(8);
  });

  it('coupes et sélections : comptent pour le joueur, pas pour le concédé ni l’avantage du terrain', async () => {
    const ucl = await repo.upsertCompetition({ slug: 'ucl', name: 'Champions League', isLeague: false });
    const nl = await repo.upsertCompetition({ slug: 'nl', name: 'Nations League', isLeague: false });
    const z = await repo.ensureTeam({ name: 'Z', sorareSlug: 'Z', pictureUrl: null, kind: 'club' });
    const p = await repo.ensureTeam({ name: 'P', sorareSlug: 'P', pictureUrl: null, kind: 'national' });
    const q = await repo.ensureTeam({ name: 'Q', sorareSlug: 'Q', pictureUrl: null, kind: 'national' });
    const cup = await repo.upsertFixture({ date: '2026-10-04T20:00:00Z', competitionId: ucl, homeTeamId: ids.A, awayTeamId: z, homeGoals: 0, awayGoals: 0, status: 'played', sorareGameId: 'cup' });
    const nt = await repo.upsertFixture({ date: '2026-10-05T20:00:00Z', competitionId: nl, homeTeamId: p, awayTeamId: q, homeGoals: 0, awayGoals: 0, status: 'played', sorareGameId: 'nt' });
    for (const f of [cup, nt]) await repo.markLineupsImported(f, null, null);
    await repo.upsertAppearance({ fixtureId: cup, playerId: ids.a1, teamId: ids.A, grid: null, detailedPosition: 'LB', started: true, minutes: 90, score: 100, decisive: 0, allAround: 100 });
    await repo.upsertAppearance({ fixtureId: nt, playerId: ids.a1, teamId: p, grid: null, detailedPosition: 'LB', started: true, minutes: 90, score: 90, decisive: 0, allAround: 90 });
    await recomputeAggregates(repo);
    // a1 : f1 60, f2 50, coupe 100, sélection 90
    const [a1] = await sql`select l5, start_rate5 from player_summary where player_id = ${ids.a1}`;
    expect(a1).toEqual({ l5: 75, start_rate5: 1 });
    // x a quitté A pour C avant le match de coupe : il ne lui est pas compté
    const [x] = await sql`select l5 from player_summary where player_id = ${ids.x}`;
    expect(x.l5).toBeCloseTo(70 / 3);
    expect(await conceded('A', 'LB')).toEqual({ average: 80, league_average: 55, observations: 1, low_sample: true });
    const [{ count }] = await sql`select count(*)::int as count from team_conceded_overall where team_id in (${z}, ${p}, ${q})`;
    expect(count).toBe(0);
    const venues = await sql`select observations from venue_factors`;
    expect(venues).toEqual([{ observations: 8 }]);
  });

  it('idempotent', async () => {
    await recomputeAggregates(repo);
    await recomputeAggregates(repo);
    const [{ count }] = await sql`select count(*)::int as count from player_summary`;
    expect(count).toBe(4);
  });
});
