import type postgres from 'postgres';
import { describeDb, freshDb } from '../helpers/db';
import { seedLeague } from '../helpers/seed';
import { createQueries, type Queries } from '@/db/queries';

describeDb('searchPlayers', () => {
  let sql: postgres.Sql;
  let q: Queries;
  beforeEach(async () => {
    const db = await freshDb();
    sql = db.sql;
    await seedLeague(db.repo);
    q = createQueries(sql);
  });
  afterEach(() => sql.end());

  it('trie par L5 et calcule l’indice du prochain adversaire', async () => {
    const rows = await q.searchPlayers({ sort: 'l5', offset: 0 });
    // L5 : Nuno 70 (1 match PSG), Greenwood (80+40)/2, Tagliafico (60+50)/2 (arrivé au 2e match), Lacazette (30+0+0)/3
    expect(rows.map((r) => r.slug)).toEqual(['nuno-mendes', 'greenwood', 'tagliafico', 'lacazette']);
    expect(rows[0].l5).toBe(70);
    const nuno = rows.find((r) => r.slug === 'nuno-mendes')!;
    expect(nuno).toMatchObject({ team: 'Paris Saint-Germain', usualPosition: 'LB', nextOpponent: 'Olympique de Marseille', nextIsHome: true });
    // OM a concédé aux LB 60 et 50 ; moyenne ligue LB = (70+60+50)/3 = 60
    expect(nuno.nextIndex).toBeCloseTo(55 / 60);
    expect(nuno.nextLowSample).toBe(true);
    const greenwood = rows.find((r) => r.slug === 'greenwood')!;
    // PSG a concédé à un ST (Lacazette 30) ; moyenne ligue ST = (30+80)/2 = 55
    expect(greenwood.nextOpponent).toBe('Paris Saint-Germain');
    expect(greenwood.nextIndex).toBeCloseTo(30 / 55);
  });

  it('filtres : texte sans accents, poste, compétition', async () => {
    expect((await q.searchPlayers({ q: 'nicolas', sort: 'l5', offset: 0 })).map((r) => r.slug)).toEqual(['tagliafico']);
    expect((await q.searchPlayers({ position: 'Forward', sort: 'l5', offset: 0 })).map((r) => r.slug)).toEqual(['greenwood', 'lacazette']);
    expect((await q.searchPlayers({ detailedPosition: 'LB', sort: 'l5', offset: 0 })).map((r) => r.slug)).toEqual(['nuno-mendes', 'tagliafico']);
    expect(await q.searchPlayers({ competition: 'autre', sort: 'l5', offset: 0 })).toEqual([]);
    expect((await q.searchPlayers({ team: 'om', sort: 'l5', offset: 0 })).map((r) => r.slug)).toEqual(['greenwood']);
  });

  it('tri par taux de titularisation', async () => {
    const rows = await q.searchPlayers({ sort: 'startRate', offset: 0 });
    // Nuno et Tagliafico à 100 % : départage par nom
    expect(rows.map((r) => r.slug)).toEqual(['tagliafico', 'nuno-mendes', 'greenwood', 'lacazette']);
  });

  it('liste des compétitions', async () => {
    expect(await q.listCompetitions()).toEqual([{ slug: 'ligue-1-fr', name: 'Ligue 1' }]);
  });

  it('liste des clubs', async () => {
    expect((await q.listTeams()).map((t) => t.slug)).toEqual(['ol', 'om', 'psg']);
  });
});

describeDb('fiche joueur', () => {
  let sql: postgres.Sql;
  let q: Queries;
  let ids: Record<string, number>;
  beforeEach(async () => {
    const db = await freshDb();
    sql = db.sql;
    ids = await seedLeague(db.repo);
    q = createQueries(sql);
  });
  afterEach(() => sql.end());

  it('getPlayer : résumé, club, prochain match et concédé par l’adversaire', async () => {
    const p = await q.getPlayer('nuno-mendes');
    expect(p).toMatchObject({
      name: 'Nuno Mendes', team: 'Paris Saint-Germain', teamSlug: 'psg', usualPosition: 'LB',
      summary: { l5: 70, startRate5: 1 },
      next: { opponent: 'Olympique de Marseille', opponentSlug: 'om', isHome: true, date: '2099-01-01T20:00:00.000Z' },
    });
    expect(p!.nextConceded).toMatchObject({ position: 'LB', average: 55, leagueAverage: 60, observations: 2, lowSample: true });
  });

  it('getPlayer : inconnu → null', async () => {
    expect(await q.getPlayer('personne')).toBeNull();
  });

  it('getPlayerGames : matchs d’équipe récents avec participation ou absence', async () => {
    const games = await q.getPlayerGames('tagliafico', 15);
    expect(games.map((g) => [g.opponent, g.score, g.status, g.position])).toEqual([
      ['Olympique de Marseille', 50, 'started', 'LB'],
      ['Olympique de Marseille', 60, 'started', 'LB'],
      ['Paris Saint-Germain', 0, 'absent', null],
    ]);
  });
});

describeDb('fiche équipe', () => {
  let sql: postgres.Sql;
  let q: Queries;
  let ids: Record<string, number>;
  beforeEach(async () => {
    const db = await freshDb();
    sql = db.sql;
    ids = await seedLeague(db.repo);
    q = createQueries(sql);
  });
  afterEach(() => sql.end());

  it('getTeam', async () => {
    expect(await q.getTeam('om')).toEqual({ id: ids.om, name: 'Olympique de Marseille', slug: 'om', competition: 'Ligue 1' });
    expect(await q.getTeam('inconnu')).toBeNull();
  });

  it('getConceded par fenêtre', async () => {
    const rows = await q.getConceded(ids.om, 5);
    expect(rows).toEqual([{ position: 'LB', average: 55, leagueAverage: 60, index: 55 / 60, observations: 2, lowSample: true }]);
    expect(await q.getConceded(ids.om, 7)).toEqual([]);
  });

  it('getTeamFixtures : derniers matchs complets', async () => {
    const f = await q.getTeamFixtures(ids.ol, 5);
    expect(f.map((x) => [x.opponent, x.isHome, x.goalsFor, x.goalsAgainst])).toEqual([
      ['Olympique de Marseille', true, 1, 0],
      ['Olympique de Marseille', false, 0, 1],
      ['Paris Saint-Germain', false, 0, 1],
    ]);
    expect(await q.getTeamFixtures(ids.ol, 1)).toHaveLength(1);
  });
});

describeDb('administration', () => {
  let sql: postgres.Sql;
  let q: Queries;
  let ids: Record<string, number>;
  let repo: import('@/db/repo').Repo;
  beforeEach(async () => {
    const db = await freshDb();
    sql = db.sql;
    repo = db.repo;
    ids = await seedLeague(db.repo);
    q = createQueries(sql);
  });
  afterEach(() => sql.end());

  it('getLastRun et date du dernier import réussi', async () => {
    expect(await q.getLastRun()).toBeNull();
    expect(await q.getLastSuccessfulImport()).toBeNull();
    const ok = await repo.startRun();
    await repo.finishRun(ok, 'ok', 4, []);
    const ko = await repo.startRun();
    await repo.finishRun(ko, 'error', 1, ['Sorare GraphQL: timeout']);
    expect(await q.getLastRun()).toMatchObject({ status: 'error', fixturesImported: 1, errors: ['Sorare GraphQL: timeout'] });
    expect(await q.getLastSuccessfulImport()).toEqual(expect.any(String));
  });
});

describeDb('matchs et projections', () => {
  let sql: postgres.Sql;
  let q: Queries;
  let ids: Record<string, number>;
  beforeEach(async () => {
    const db = await freshDb();
    sql = db.sql;
    ids = await seedLeague(db.repo);
    q = createQueries(sql);
  });
  afterEach(() => sql.end());

  it('getPlayerGames : lien vers le match, adversaire et score du match', async () => {
    const [g] = await q.getPlayerGames('greenwood', 15);
    expect(g).toMatchObject({ fixtureId: ids.g3, opponent: 'Olympique Lyonnais', opponentSlug: 'ol', isHome: false, goalsFor: 0, goalsAgainst: 1 });
  });

  it('getUpcoming : prochains matchs, forme et indices de l’adversaire', async () => {
    const u = await q.getUpcoming('nuno-mendes', 5);
    expect(u).toMatchObject({ form: 70, startRate: 1, usualPosition: 'LB' });
    expect(u!.fixtures).toHaveLength(1);
    expect(u!.fixtures[0]).toMatchObject({
      fixtureId: ids.next, opponent: 'Olympique de Marseille', opponentSlug: 'om', isHome: true,
      position: { average: 55, observations: 2 },
      overall: { observations: 2 },
    });
    expect(u!.fixtures[0].position!.index).toBeCloseTo(55 / 60);
  });

  it('getUpcoming : joueur inconnu → null', async () => {
    expect(await q.getUpcoming('personne', 5)).toBeNull();
  });

  it('getMatch : équipes, score, formations et joueurs', async () => {
    const m = await q.getMatch(ids.g2);
    expect(m).toMatchObject({
      id: ids.g2, status: 'played', competition: 'Ligue 1',
      home: { name: 'Olympique de Marseille', slug: 'om', goals: 1, formation: '4-3-3' },
      away: { name: 'Olympique Lyonnais', slug: 'ol', goals: 0, formation: '4-3-3' },
    });
    expect(m!.players).toEqual([
      expect.objectContaining({ side: 'home', slug: 'greenwood', name: 'Mason Greenwood', detailedPosition: 'ST', started: true, score: 80, decisive: 40, allAround: 40 }),
      expect.objectContaining({ side: 'away', slug: 'tagliafico', detailedPosition: 'LB', started: true, score: 60 }),
    ]);
  });

  it('getMatch : inconnu → null', async () => {
    expect(await q.getMatch(999999)).toBeNull();
  });
});
