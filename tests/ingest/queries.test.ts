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

  it('getUnmatched avec le match concerné', async () => {
    await repo.addUnmatched({ source: 'sorare', externalId: 'hernandez', name: 'Hernández', club: 'om', fixtureId: ids.g2 });
    expect(await q.getUnmatched()).toEqual([
      { source: 'sorare', name: 'Hernández', club: 'om', fixture: 'Olympique de Marseille – Olympique Lyonnais', date: '2026-10-11T20:00:00.000Z' },
    ]);
  });

  it('getLastRun et date du dernier import réussi', async () => {
    expect(await q.getLastRun()).toBeNull();
    expect(await q.getLastSuccessfulImport()).toBeNull();
    const ok = await repo.startRun();
    await repo.finishRun(ok, 'ok', 4, []);
    const ko = await repo.startRun();
    await repo.finishRun(ko, 'quota_exhausted', 1, ['Quota API-Football atteint']);
    expect(await q.getLastRun()).toMatchObject({ status: 'quota_exhausted', fixturesImported: 1, errors: ['Quota API-Football atteint'] });
    expect(await q.getLastSuccessfulImport()).toEqual(expect.any(String));
  });
});
