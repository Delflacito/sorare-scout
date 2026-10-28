import type postgres from 'postgres';
import { describeDb, freshDb } from '../helpers/db';
import type { Repo } from '@/db/repo';
import { importFixtures } from '@/ingest/fixtures';
import type { League } from '@/ingest/leagues';
import type { SorareClient, SorareGame, SorarePlayerScore } from '@/sources/sorare';
import { QuotaExhaustedError, type ApiFootballClient, type AfLineup, type AfFixture } from '@/sources/apiFootball';

const league: League = { key: 'ligue1', name: 'Ligue 1', sorareSlug: 'ligue-1-fr', apifootballId: 61 };

const game = (id: string, date: string, home: string, away: string, status: SorareGame['status'] = 'played'): SorareGame =>
  ({ id, date, homeClubSlug: home, awayClubSlug: away, homeGoals: 1, awayGoals: 0, status });
const score = (playerSlug: string, displayName: string, clubSlug: string, position: SorarePlayerScore['position'], s: number, minutes = 90): SorarePlayerScore =>
  ({ playerSlug, displayName, clubSlug, position, score: s, decisive: 10, allAround: s - 10, minutes });
const afFx = (id: number, date: string, home: number, away: number): AfFixture =>
  ({ id, date, homeTeamId: home, awayTeamId: away, homeName: '', awayName: '', status: 'FT' });

const G1 = game('Game:1', '2026-10-25T19:00:00Z', 'psg', 'om');
const G2 = game('Game:2', '2026-10-18T19:00:00Z', 'om', 'psg');

const LINEUPS_G1: AfLineup[] = [
  { teamId: 85, formation: '4-3-3', players: [
    { playerId: 1, name: 'G. Donnarumma', grid: '1:1', started: true },
    { playerId: 42, name: 'Nuno Mendes', grid: '2:1', started: true },
  ] },
  { teamId: 81, formation: '4-3-3', players: [
    { playerId: 9, name: 'Mason Greenwood', grid: '4:2', started: true },
    { playerId: 77, name: 'L. Hernández', grid: null, started: false },
    { playerId: 78, name: 'T. Hernández', grid: null, started: false },
  ] },
];
const SCORES_G1 = [
  score('nuno-mendes', 'Nuno Mendes', 'psg', 'Defender', 72),
  score('mason-greenwood', 'Mason Greenwood', 'om', 'Forward', 55),
  score('hernandez', 'Hernández', 'om', 'Defender', 40, 20),
  score('bench-guy', 'Bench Guy', 'psg', 'Midfielder', 0, 0),
];

function fakes(opts: { lineups?: Record<number, AfLineup[]>; budget?: number; noScores?: boolean } = {}) {
  const lineupCalls: number[] = [];
  let calls = 0;
  const budget = opts.budget ?? Infinity;
  const spend = () => { if (calls >= budget) throw new QuotaExhaustedError(); calls++; };
  const sorare = {
    clubGames: async (slug: string) => slug === 'psg'
      ? [G1, G2, game('Game:9', '2026-10-21T19:00:00Z', 'psg', 'real-madrid'), game('Game:3', '2026-11-01T20:00:00Z', 'psg', 'om', 'scheduled')]
      : [G1, G2],
    gameScores: async (id: string) => (opts.noScores ? [] : id === 'Game:1' ? SCORES_G1 : [score('nuno-mendes', 'Nuno Mendes', 'psg', 'Defender', 30)]),
  } as unknown as SorareClient;
  const lineups = opts.lineups ?? { 1001: LINEUPS_G1, 1002: [
    { teamId: 81, formation: '4-4-2', players: [] },
    { teamId: 85, formation: '3-5-2', players: [{ playerId: 42, name: 'Nuno Mendes', grid: '3:1', started: true }] },
  ] };
  const apiFootball = {
    fixtures: async () => { spend(); return [afFx(1001, '2026-10-25T19:00:00+00:00', 85, 81), afFx(1002, '2026-10-18T19:00:00+00:00', 81, 85)]; },
    lineups: async (id: number) => { spend(); lineupCalls.push(id); return lineups[id] ?? []; },
  } as unknown as ApiFootballClient;
  return { sorare, apiFootball, lineupCalls };
}

describeDb('importFixtures', () => {
  let sql: postgres.Sql;
  let repo: Repo;
  beforeEach(async () => {
    ({ sql, repo } = await freshDb());
    const competitionId = await repo.upsertCompetition({ slug: 'ligue-1-fr', name: 'Ligue 1', apifootballId: 61 });
    await repo.upsertTeam({ name: 'PSG', sorareSlug: 'psg', apifootballId: 85, competitionId });
    await repo.upsertTeam({ name: 'OM', sorareSlug: 'om', apifootballId: 81, competitionId });
  });
  afterEach(() => sql.end());

  const positions = () => sql`
    select p.sorare_slug, f.sorare_game_id, a.detailed_position, a.started, a.sorare_score
    from appearances a join players p on p.id = a.player_id join fixtures f on f.id = a.fixture_id
    order by f.sorare_game_id, p.sorare_slug`;

  it('importe matchs, postes précis et scores', async () => {
    const f = fakes();
    const r = await importFixtures({ ...f, repo }, 2026, [league]);
    expect(r).toEqual({ fixturesImported: 2, status: 'ok', errors: [] });
    const rows = await positions();
    expect(rows).toContainEqual({ sorare_slug: 'nuno-mendes', sorare_game_id: 'Game:1', detailed_position: 'LB', started: true, sorare_score: 72 });
    expect(rows).toContainEqual({ sorare_slug: 'mason-greenwood', sorare_game_id: 'Game:1', detailed_position: 'ST', started: true, sorare_score: 55 });
    expect(rows).toContainEqual({ sorare_slug: 'bench-guy', sorare_game_id: 'Game:1', detailed_position: null, started: false, sorare_score: 0 });
    expect(rows).toContainEqual({ sorare_slug: 'nuno-mendes', sorare_game_id: 'Game:2', detailed_position: 'LWB', started: true, sorare_score: 30 });
  });

  it('ignore les matchs hors compétition et garde les matchs à venir', async () => {
    await importFixtures({ ...fakes(), repo }, 2026, [league]);
    const games = await sql`select sorare_game_id, status from fixtures order by sorare_game_id`;
    expect(games).toEqual([
      { sorare_game_id: 'Game:1', status: 'played' },
      { sorare_game_id: 'Game:2', status: 'played' },
      { sorare_game_id: 'Game:3', status: 'scheduled' },
    ]);
  });

  it('homonymes → unmatched_players, participation sans poste', async () => {
    await importFixtures({ ...fakes(), repo }, 2026, [league]);
    const u = await sql`select source, external_id, club from unmatched_players`;
    expect(u).toEqual([{ source: 'sorare', external_id: 'hernandez', club: 'om' }]);
    const rows = await positions();
    expect(rows).toContainEqual({ sorare_slug: 'hernandez', sorare_game_id: 'Game:1', detailed_position: null, started: false, sorare_score: 40 });
  });

  it('relance : aucun doublon, aucune compo redemandée', async () => {
    await importFixtures({ ...fakes(), repo }, 2026, [league]);
    const f2 = fakes();
    const r = await importFixtures({ ...f2, repo }, 2026, [league]);
    expect(f2.lineupCalls).toEqual([]);
    expect(r.fixturesImported).toBe(0);
    const [{ count }] = await sql`select count(*)::int as count from appearances`;
    expect(count).toBe(5);
  });

  it('compo non publiée : match laissé en attente, sans erreur', async () => {
    const r = await importFixtures({ ...fakes({ lineups: { 1001: LINEUPS_G1 } }), repo }, 2026, [league]);
    expect(r).toMatchObject({ fixturesImported: 1, status: 'ok' });
    const pending = await sql`select sorare_game_id from fixtures where status = 'played' and not lineups_imported`;
    expect(pending).toEqual([{ sorare_game_id: 'Game:2' }]);
  });

  it('quota épuisé en cours de route puis reprise', async () => {
    const r = await importFixtures({ ...fakes({ budget: 2 }), repo }, 2026, [league]);
    expect(r).toMatchObject({ fixturesImported: 1, status: 'quota_exhausted' });
    const r2 = await importFixtures({ ...fakes(), repo }, 2026, [league]);
    expect(r2).toMatchObject({ fixturesImported: 1, status: 'ok' });
    const [{ count }] = await sql`select count(*)::int as count from appearances`;
    expect(count).toBe(5);
  });

  it('réutilise les matchs API-Football déjà récupérés', async () => {
    const f = fakes();
    let calls = 0;
    const apiFootball = { ...f.apiFootball, fixtures: async () => { calls++; return []; } } as unknown as ApiFootballClient;
    const prefetched = new Map([[61, [afFx(1001, '2026-10-25T19:00:00+00:00', 85, 81), afFx(1002, '2026-10-18T19:00:00+00:00', 81, 85)]]]);
    const r = await importFixtures({ ...f, apiFootball, repo }, 2026, [league], prefetched);
    expect(calls).toBe(0);
    expect(r.fixturesImported).toBe(2);
  });

  it('scores Sorare pas encore publiés : aucune requête API-Football de compo', async () => {
    const f = fakes({ noScores: true });
    const r = await importFixtures({ ...f, repo }, 2026, [league]);
    expect(f.lineupCalls).toEqual([]);
    expect(r.fixturesImported).toBe(0);
  });

  it('compo jamais publiée : abandon après 5 tentatives', async () => {
    for (let i = 0; i < 5; i++) await importFixtures({ ...fakes({ lineups: { 1001: LINEUPS_G1 } }), repo }, 2026, [league]);
    const f = fakes({ lineups: { 1001: LINEUPS_G1 } });
    await importFixtures({ ...f, repo }, 2026, [league]);
    expect(f.lineupCalls).toEqual([]);
  });

  it('un joueur de la compo n’est attribué qu’une fois (Gabriel / Gabriel Martinelli)', async () => {
    const lineups = { 1001: [LINEUPS_G1[0], { ...LINEUPS_G1[1], players: [...LINEUPS_G1[1].players, { playerId: 11, name: 'Gabriel Martinelli', grid: '4:1', started: true }] }] };
    const f = fakes({ lineups });
    const sorare = {
      ...f.sorare,
      gameScores: async () => [score('gabriel-magalhaes', 'Gabriel', 'om', 'Defender', 0, 0), score('gabriel-martinelli', 'Gabriel Martinelli', 'om', 'Forward', 65), ...SCORES_G1],
    } as unknown as SorareClient;
    const r = await importFixtures({ ...f, sorare, repo }, 2026, [league]);
    expect(r.errors).toEqual([]);
    const rows = await sql`select sorare_slug, apifootball_id from players where sorare_slug like 'gabriel%' order by 1`;
    expect(rows).toEqual([{ sorare_slug: 'gabriel-magalhaes', apifootball_id: null }, { sorare_slug: 'gabriel-martinelli', apifootball_id: 11 }]);
    expect(await positions()).toContainEqual({ sorare_slug: 'gabriel-martinelli', sorare_game_id: 'Game:1', detailed_position: 'LW', started: true, sorare_score: 65 });
  });

  it('identifiant API-Football déjà pris par un autre joueur : non apparié, sans erreur', async () => {
    const teamId = (await sql`select id from teams where sorare_slug = 'psg'`)[0].id;
    await repo.upsertPlayer({ name: 'Autre', sorareSlug: 'autre', apifootballId: 42, position: 'Defender', teamId });
    const r = await importFixtures({ ...fakes(), repo }, 2026, [league]);
    expect(r.errors).toEqual([]);
    const [nuno] = await sql`select apifootball_id from players where sorare_slug = 'nuno-mendes'`;
    expect(nuno.apifootball_id).toBeNull();
  });

  it('formation inconnue signalée dans les erreurs, gardien conservé', async () => {
    const lineups = { 1001: [LINEUPS_G1[0], { ...LINEUPS_G1[1], formation: '4-3-1-2' }] };
    const r = await importFixtures({ ...fakes({ lineups }), repo }, 2026, [league]);
    expect(r.errors).toContain('formation inconnue 4-3-1-2 (match Game:1)');
    expect(r.fixturesImported).toBe(1);
  });

  it('erreur Sorare sur un club : signalée, le reste est importé', async () => {
    const f = fakes();
    const sorare = {
      ...f.sorare,
      clubGames: async (slug: string) => { if (slug === 'om') throw new Error('Sorare GraphQL: club introuvable'); return f.sorare.clubGames(slug); },
    } as unknown as SorareClient;
    const r = await importFixtures({ ...f, sorare, repo }, 2026, [league]);
    expect(r.errors).toContain('club om : Sorare GraphQL: club introuvable');
    expect(r.fixturesImported).toBe(2);
  });

  it('erreur sur une ligue : signalée, les autres ligues continuent', async () => {
    const f = fakes();
    const other: League = { key: 'laliga', name: 'LaLiga', sorareSlug: 'laliga-es', apifootballId: 140 };
    const apiFootball = { ...f.apiFootball, fixtures: async (id: number) => { if (id === 140) throw new Error('API-Football down'); return f.apiFootball.fixtures(id, 2026); } } as unknown as ApiFootballClient;
    const r = await importFixtures({ ...f, apiFootball, repo }, 2026, [other, league]);
    expect(r.errors).toContain('ligue LaLiga : API-Football down');
    expect(r.fixturesImported).toBe(2);
  });
});
