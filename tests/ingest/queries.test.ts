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

describeDb('coupes et sélections', () => {
  let sql: postgres.Sql;
  let q: Queries;
  let ids: Record<string, number>;
  beforeEach(async () => {
    const db = await freshDb();
    sql = db.sql;
    ids = await seedLeague(db.repo);
    const ucl = await db.repo.upsertCompetition({ slug: 'ucl', name: 'Champions League', isLeague: false });
    const barca = await db.repo.ensureTeam({ name: 'Barcelone', sorareSlug: 'barca', pictureUrl: null, kind: 'club' });
    ids.cup = await db.repo.upsertFixture({ date: '2026-10-21T20:00:00Z', competitionId: ucl, homeTeamId: barca, awayTeamId: ids.ol, homeGoals: 2, awayGoals: 2, status: 'played', sorareGameId: 'cup' });
    await db.repo.markLineupsImported(ids.cup, null, null);
    await db.repo.upsertAppearance({ fixtureId: ids.cup, playerId: ids.tagliafico, teamId: ids.ol, grid: null, detailedPosition: 'LB', started: true, minutes: 90, score: 70, decisive: 35, allAround: 35 });
    q = createQueries(sql);
  });
  afterEach(() => sql.end());

  it('derniers matchs du joueur : compétition indiquée', async () => {
    const [g, h] = await q.getPlayerGames('tagliafico', 15);
    expect(g).toMatchObject({ fixtureId: ids.cup, opponent: 'Barcelone', competition: 'Champions League', isLeague: false, score: 70, goalsFor: 2 });
    expect(h).toMatchObject({ competition: 'Ligue 1', isLeague: true });
  });

  it('fiche équipe et filtres : championnat uniquement', async () => {
    expect((await q.getTeamFixtures(ids.ol, 5)).map((f) => f.opponent)).not.toContain('Barcelone');
    expect(await q.listCompetitions()).toEqual([{ slug: 'ligue-1-fr', name: 'Ligue 1' }]);
    expect((await q.listTeams()).map((t) => t.slug)).toEqual(['ol', 'om', 'psg']);
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
    expect(u).toMatchObject({ base: 70, homeAvg: 70, homeGames: 1, awayAvg: null, awayGames: 0, startRate: 1, usualPosition: 'LB' });
    expect(u!.fixtures).toHaveLength(1);
    expect(u!.fixtures[0]).toMatchObject({
      fixtureId: ids.next, opponent: 'Olympique de Marseille', opponentSlug: 'om', isHome: true,
      position: { average: 55, leagueAverage: 60, observations: 2 },
      overall: { observations: 2, rating: expect.any(Number) },
    });
    // titulaires à domicile en Ligue 1 (démo) : 70, 80, 50 ; à l'extérieur : 30, 60 ; tous : 58
    expect(u!.fixtures[0].leagueVenueFactor).toBeCloseTo((200 / 3) / 58);
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

describeDb('photos, logos et statuts', () => {
  let sql: postgres.Sql;
  let q: Queries;
  let ids: Record<string, number>;
  beforeEach(async () => {
    const db = await freshDb();
    sql = db.sql;
    ids = await seedLeague(db.repo);
    await sql`update teams set picture_url = 'https://t/' || sorare_slug || '.png', short_name = upper(sorare_slug)`;
    await db.repo.updatePlayerStatuses([
      { slug: 'nuno-mendes', pictureUrl: 'https://p/nuno.png', playingStatus: 'SUBSTITUTE', injury: { kind: 'Thigh Injury', expectedEnd: '2026-11-10' }, suspension: null, projection: 41 },
      { slug: 'greenwood', pictureUrl: null, playingStatus: 'STARTER', injury: null, suspension: { reason: 'Red card', end: '2026-11-02' }, projection: 70 },
    ]);
    q = createQueries(sql);
  });
  afterEach(() => sql.end());

  it('explorateur', async () => {
    const rows = await q.searchPlayers({ sort: 'l5', offset: 0 });
    expect(rows.find((r) => r.slug === 'nuno-mendes')).toMatchObject({
      pictureUrl: 'https://p/nuno.png', teamPictureUrl: 'https://t/psg.png', playingStatus: 'SUBSTITUTE', injuryKind: 'Thigh Injury',
      suspensionReason: null, sorareProjection: 41,
    });
    expect(rows.find((r) => r.slug === 'greenwood')).toMatchObject({ suspensionReason: 'Red card', sorareProjection: 70 });
  });

  it('fiche joueur', async () => {
    expect(await q.getPlayer('nuno-mendes')).toMatchObject({
      pictureUrl: 'https://p/nuno.png', teamPictureUrl: 'https://t/psg.png', playingStatus: 'SUBSTITUTE',
      injury: { kind: 'Thigh Injury', end: '2026-11-10' }, suspension: null, sorareProjection: 41,
    });
    expect(await q.getPlayer('greenwood')).toMatchObject({ injury: null, suspension: { reason: 'Red card', end: '2026-11-02' } });
  });

  it('logos des adversaires dans les derniers et prochains matchs', async () => {
    const [g] = await q.getPlayerGames('greenwood', 15);
    expect(g).toMatchObject({ opponentPictureUrl: 'https://t/ol.png', opponentShortName: 'OL' });
    const u = await q.getUpcoming('nuno-mendes', 5);
    expect(u!.fixtures[0]).toMatchObject({ opponentPictureUrl: 'https://t/om.png' });
  });

  it('page match : logos des équipes', async () => {
    const m = await q.getMatch(ids.g2);
    expect(m).toMatchObject({ home: { pictureUrl: 'https://t/om.png' }, away: { pictureUrl: 'https://t/ol.png' } });
  });
});

describeDb('Ma Game Week et journée', () => {
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

  it('prochaine journée : matchs dans les 4 jours suivant le premier', async () => {
    const l1 = ids.l1;
    await sql`insert into fixtures (date, competition_id, home_team_id, away_team_id, status, sorare_game_id)
      values ('2099-01-03T20:00:00Z', ${l1}, ${ids.ol}, ${ids.psg}, 'scheduled', 'g10'), ('2099-01-09T20:00:00Z', ${l1}, ${ids.om}, ${ids.ol}, 'scheduled', 'g11')`;
    const f = await q.getGameWeekFixtures();
    expect(f.map((x) => [x.home.slug, x.away.slug])).toEqual([['psg', 'om'], ['ol', 'psg']]);
    expect(f[0]).toMatchObject({ competition: 'Ligue 1', home: { name: 'Paris Saint-Germain' }, away: { rating: expect.any(Number) } });
    expect(await q.getGameWeekFixtures('premier-league')).toEqual([]);
  });

  it('meilleurs scores potentiels par poste, blessés exclus', async () => {
    const fixtures = await q.getGameWeekFixtures();
    const players = await q.getGameWeekPlayers(fixtures.map((f) => f.id), { minStartRate: 0, limit: 10 });
    expect(players.map((p) => p.slug)).toEqual(['nuno-mendes', 'greenwood']); // défenseur puis attaquant
    expect(players[0]).toMatchObject({ team: 'Paris Saint-Germain', opponent: 'Olympique de Marseille', isHome: true, projected: expect.any(Number) });
    await sql`update players set injury_kind = 'Knee' where sorare_slug = 'nuno-mendes'`;
    const after = await q.getGameWeekPlayers(fixtures.map((f) => f.id), { minStartRate: 0.6, limit: 10 });
    expect(after.map((p) => p.slug)).toEqual([]); // Greenwood : titulaire 1 fois sur 2
  });

  it('plus gros boosts : classés par gain sur le niveau habituel', async () => {
    const fixtures = await q.getGameWeekFixtures();
    await sql`update player_summary set base = 90, next_projected = 95 where player_id = ${ids['nuno-mendes']}`;
    await sql`update player_summary set base = 40, next_projected = 60 where player_id = ${ids.greenwood}`;
    await sql`update players set position = 'Defender' where sorare_slug = 'greenwood'`;
    const ids9 = fixtures.map((f) => f.id);
    const top = await q.getGameWeekPlayers(ids9, { minStartRate: 0, limit: 10 });
    expect(top.map((p) => p.slug)).toEqual(['nuno-mendes', 'greenwood']);
    const boost = await q.getGameWeekPlayers(ids9, { minStartRate: 0, limit: 10, sort: 'boost' });
    expect(boost.map((p) => [p.slug, p.base])).toEqual([['greenwood', 40], ['nuno-mendes', 90]]);
  });

  it('cartes à plusieurs postes : le joueur apparaît dans chaque section', async () => {
    await sql`update players set card_positions = '{Defender,Midfielder}' where sorare_slug = 'nuno-mendes'`;
    const fixtures = await q.getGameWeekFixtures();
    const players = await q.getGameWeekPlayers(fixtures.map((f) => f.id), { minStartRate: 0, limit: 10 });
    expect(players.map((p) => [p.slug, p.position])).toEqual([['nuno-mendes', 'Defender'], ['nuno-mendes', 'Midfielder'], ['greenwood', 'Forward']]);
    const mids = await q.searchPlayers({ sort: 'l5', position: 'Midfielder', offset: 0 });
    expect(mids.map((r) => r.slug)).toContain('nuno-mendes');
  });

  it('adversaires par poste : ce que concède l’adversaire de chaque équipe', async () => {
    const fixtures = await q.getGameWeekFixtures();
    const m = await q.getRoundMatchups(fixtures.map((f) => f.id));
    expect(m.map((x) => [x.teamSlug, x.opponentSlug, x.isHome])).toEqual([['psg', 'om', true], ['om', 'psg', false]]);
    // OM a concédé aux latéraux gauches 60 (Tagliafico, g2) et 50 (g3)
    expect(m[0].byPosition.LB).toMatchObject({ average: 55, observations: 2 });
  });

  it('explorateur : tri par score potentiel et masquage des indisponibles', async () => {
    await sql`update players set suspension_reason = 'Red card' where sorare_slug = 'greenwood'`;
    const rows = await q.searchPlayers({ sort: 'projected', available: true, offset: 0 });
    expect(rows.map((r) => r.slug)).not.toContain('greenwood');
    expect(rows[0]).toMatchObject({ slug: 'nuno-mendes', nextProjected: expect.any(Number) });
  });
});

describeDb('trading', () => {
  let sql: postgres.Sql;
  let q: Queries;
  let ids: Record<string, number>;
  beforeEach(async () => {
    const db = await freshDb();
    sql = db.sql;
    ids = await seedLeague(db.repo);
    await sql`update players set market_updated_at = now(), floor_in_season = 10`;
    const rows = [['nuno-mendes', 10, 20, 0.5, 0.2], ['greenwood', 30, 20, 1.5, -0.1], ['tagliafico', 15, 15, 1, 0.05]] as const;
    await db.repo.replacePlayerMarket(rows.map(([slug, price, fair, ratio, gain]) => ({
      playerId: ids[slug], referencePrice: price, recentPrice: price, priceTrend7: 0, sales30: 5, fairPrice: fair, valueRatio: ratio,
      potentialPrice: price * (1 + gain), potentialGain: gain,
    })));
    q = createQueries(sql);
  });
  afterEach(() => sql.end());

  it('sous- et surévalués, filtre de prix', async () => {
    expect((await q.getTrading({ view: 'sous', limit: 10 })).map((r) => r.slug)).toEqual(['nuno-mendes', 'tagliafico', 'greenwood']);
    expect((await q.getTrading({ view: 'sur', limit: 10 }))[0].slug).toBe('greenwood');
    expect((await q.getTrading({ view: 'sous', maxPrice: 12, limit: 10 })).map((r) => r.slug)).toEqual(['nuno-mendes']);
  });

  it('hausse avant la GW : matchs de la journée, plus forte plus-value d’abord', async () => {
    const fixtures = await q.getGameWeekFixtures();
    const rows = await q.getTrading({ view: 'gw', fixtureIds: fixtures.map((f) => f.id), limit: 10 });
    // PSG–OM : Nuno Mendes (+20 %) et Greenwood (titulaire 1 fois sur 2 → exclu)
    expect(rows.map((r) => [r.slug, r.potentialGain])).toEqual([['nuno-mendes', 0.2]]);
    expect(rows[0]).toMatchObject({ nextOpponent: 'Olympique de Marseille', nextIsHome: true, price: 10 });
  });

  it('fiche : marché du joueur et ventes', async () => {
    await sql`insert into card_sales (player_id, sold_at, price_eur, in_season) values (${ids['nuno-mendes']}, '2026-10-20T10:00:00Z', 9, true)`;
    expect((await q.getPlayer('nuno-mendes'))!.market).toMatchObject({ floorInSeason: 10, fairPrice: 20, valueRatio: 0.5 });
    expect(await q.getPlayerSales('nuno-mendes')).toEqual([{ date: '2026-10-20T10:00:00.000Z', eur: 9, inSeason: true }]);
  });
});

describeDb('marché par club et effectif', () => {
  let sql: postgres.Sql;
  let q: Queries;
  let ids: Record<string, number>;
  beforeEach(async () => {
    const db = await freshDb();
    sql = db.sql;
    ids = await seedLeague(db.repo);
    await sql`update players set floor_in_season = 20, floor_classic = 5, market_updated_at = now() where sorare_slug = 'tagliafico'`;
    await sql`update players set floor_in_season = 8 where sorare_slug = 'lacazette'`;
    await db.repo.replacePlayerMarket([{ playerId: ids.tagliafico, referencePrice: 20, recentPrice: 21, priceTrend7: null, sales30: 4,
      fairPrice: 30, valueRatio: 2 / 3, potentialPrice: 22, potentialGain: 0.1 }]);
    q = createQueries(sql);
  });
  afterEach(() => sql.end());

  it('valeur totale des cartes par club', async () => {
    const clubs = await q.getClubsMarket();
    expect(clubs[0]).toMatchObject({ slug: 'ol', players: 2, priced: 2, totalFloor: 28, topPlayer: 'Nicolás Tagliafico', topPrice: 20 });
    expect(clubs.find((c) => c.slug === 'psg')).toMatchObject({ priced: 0, totalFloor: 0, topPlayer: null });
    expect(await q.getClubsMarket('premier-league')).toEqual([]);
  });

  it('joueurs cotés : d’un club, par recherche, par liste', async () => {
    expect((await q.getMarketPlayers({ team: 'ol' })).map((p) => [p.slug, p.price])).toEqual([['tagliafico', 20], ['lacazette', 8]]);
    const [t] = await q.getMarketPlayers({ q: 'taglia' });
    expect(t).toMatchObject({ team: 'Olympique Lyonnais', competitionSlug: 'ligue-1-fr', fairPrice: 30, potentialPrice: 22, floorClassic: 5 });
    expect((await q.getMarketPlayers({ slugs: ['greenwood', 'tagliafico'] })).map((p) => p.slug)).toEqual(['tagliafico', 'greenwood']);
    expect(await q.getMarketPlayers({ slugs: [] })).toEqual([]);
  });
});
