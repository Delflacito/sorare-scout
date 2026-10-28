import type postgres from 'postgres';
import { describeDb, freshDb } from '../helpers/db';
import type { Repo } from '@/db/repo';
import { importClubs } from '@/ingest/clubs';
import type { League } from '@/ingest/leagues';
import type { SorareClient } from '@/sources/sorare';

const league: League = { key: 'ligue1', name: 'Ligue 1', sorareSlug: 'ligue-1-fr' };
const sorareWith = (slugs: string[]) =>
  ({ clubs: async () => slugs.map((slug) => ({ slug, name: slug.toUpperCase(), competitionSlug: 'ligue-1-fr' })) }) as unknown as SorareClient;

describeDb('importClubs', () => {
  let sql: postgres.Sql;
  let repo: Repo;
  beforeEach(async () => ({ sql, repo } = await freshDb()));
  afterEach(() => sql.end());

  const attached = () => sql`select t.sorare_slug from teams t join competitions c on c.id = t.competition_id order by 1`;

  it('importe les clubs du championnat', async () => {
    const r = await importClubs({ sorare: sorareWith(['psg', 'om', 'ol']), repo }, [league]);
    expect(r.clubs).toBe(3);
    expect((await attached()).map((x) => x.sorare_slug)).toEqual(['ol', 'om', 'psg']);
  });

  it('idempotent', async () => {
    await importClubs({ sorare: sorareWith(['psg', 'om']), repo }, [league]);
    await importClubs({ sorare: sorareWith(['psg', 'om']), repo }, [league]);
    const [{ count }] = await sql`select count(*)::int as count from teams`;
    expect(count).toBe(2);
  });

  it('club relégué détaché de la compétition à la saison suivante', async () => {
    await importClubs({ sorare: sorareWith(['psg', 'om']), repo }, [league]);
    await importClubs({ sorare: sorareWith(['psg', 'promu']), repo }, [league]);
    expect((await attached()).map((x) => x.sorare_slug)).toEqual(['promu', 'psg']);
  });
});
