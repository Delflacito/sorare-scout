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
    // L5 : Nuno 70 (1 match PSG), Greenwood (80+40)/2, Tagliafico (0+60+50)/3, Lacazette (30+0+0)/3
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
  });

  it('tri par taux de titularisation', async () => {
    const rows = await q.searchPlayers({ sort: 'startRate', offset: 0 });
    expect(rows.map((r) => r.slug)).toEqual(['nuno-mendes', 'tagliafico', 'greenwood', 'lacazette']);
  });

  it('liste des compétitions', async () => {
    expect(await q.listCompetitions()).toEqual([{ slug: 'ligue-1-fr', name: 'Ligue 1' }]);
  });
});
