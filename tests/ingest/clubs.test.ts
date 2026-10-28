import type postgres from 'postgres';
import { describeDb, freshDb } from '../helpers/db';
import type { Repo } from '@/db/repo';
import { importClubs } from '@/ingest/clubs';
import type { League } from '@/ingest/leagues';
import type { SorareClient } from '@/sources/sorare';
import type { ApiFootballClient } from '@/sources/apiFootball';

const league: League = { key: 'ligue1', name: 'Ligue 1', sorareSlug: 'ligue-1-fr', apifootballId: 61 };

const sorare = {
  clubs: async () => [
    { slug: 'psg', name: 'Paris Saint-Germain', competitionSlug: 'ligue-1-fr' },
    { slug: 'ol', name: 'Olympique Lyonnais', competitionSlug: 'ligue-1-fr' },
    { slug: 'om', name: 'Olympique de Marseille', competitionSlug: 'ligue-1-fr' },
    { slug: 'new', name: 'Club Inconnu', competitionSlug: 'ligue-1-fr' },
  ],
} as unknown as SorareClient;

const fx = (id: number, h: [number, string], a: [number, string]) => ({ id, date: '2026-10-25T19:00:00+00:00', status: 'FT', homeTeamId: h[0], homeName: h[1], awayTeamId: a[0], awayName: a[1] });
const apiFootball = {
  fixtures: async () => [fx(1, [85, 'Paris Saint Germain'], [80, 'Lyon']), fx(2, [81, 'Marseille'], [99, 'Le Havre'])],
} as unknown as ApiFootballClient;

describeDb('importClubs', () => {
  let sql: postgres.Sql;
  let repo: Repo;
  beforeEach(async () => ({ sql, repo } = await freshDb()));
  afterEach(() => sql.end());

  it('apparie les clubs des deux sources, alias compris', async () => {
    const r = await importClubs({ sorare, apiFootball, repo }, 2026, [league]);
    expect(r.matched).toBe(3);
    const teams = await sql`select sorare_slug, apifootball_id from teams order by sorare_slug`;
    expect(teams).toEqual([
      { sorare_slug: 'new', apifootball_id: null },
      { sorare_slug: 'ol', apifootball_id: 80 },
      { sorare_slug: 'om', apifootball_id: 81 },
      { sorare_slug: 'psg', apifootball_id: 85 },
    ]);
  });

  it('liste les clubs non appariés des deux côtés', async () => {
    const r = await importClubs({ sorare, apiFootball, repo }, 2026, [league]);
    expect(r.unmatched).toEqual([
      { source: 'sorare', name: 'Club Inconnu' },
      { source: 'apifootball', name: 'Le Havre' },
    ]);
  });

  it('idempotent', async () => {
    await importClubs({ sorare, apiFootball, repo }, 2026, [league]);
    await importClubs({ sorare, apiFootball, repo }, 2026, [league]);
    const [{ count }] = await sql`select count(*)::int as count from teams`;
    expect(count).toBe(4);
  });
});
