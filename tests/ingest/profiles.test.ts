import type postgres from 'postgres';
import { describeDb, freshDb } from '../helpers/db';
import type { Repo } from '@/db/repo';
import { importProfiles, recentSeasons } from '@/ingest/profiles';
import type { SorareClient, SorarePlayerProfile } from '@/sources/sorare';

const season = (startYear: number, goals: number) => ({ startYear, appearances: 30, substituteIn: 2, goals, assists: 4, minutes: 2500, yellowCards: 3, redCards: 0 });

describe('recentSeasons', () => {
  it('saison en cours (début en août) et les 5 précédentes', () => {
    expect(recentSeasons(new Date('2026-10-28T00:00:00Z'))).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
    expect(recentSeasons(new Date('2027-03-01T00:00:00Z'), 2)).toEqual([2026, 2025]);
  });
});

describeDb('importProfiles', () => {
  let sql: postgres.Sql;
  let repo: Repo;
  beforeEach(async () => {
    ({ sql, repo } = await freshDb());
    const competitionId = await repo.upsertCompetition({ slug: 'ligue-1-fr', name: 'Ligue 1' });
    const psg = await repo.upsertTeam({ name: 'PSG', sorareSlug: 'psg', competitionId });
    for (const slug of ['a', 'b', 'c']) await repo.upsertPlayer({ name: slug, sorareSlug: slug, position: 'Forward', teamId: psg });
  });
  afterEach(() => sql.end());

  const fake = (calls: string[][]) => ({
    playerProfiles: async (slugs: string[]): Promise<SorarePlayerProfile[]> => {
      calls.push(slugs);
      return slugs.filter((s) => s !== 'c').map((slug) => ({
        slug, birthDate: '1998-12-20', country: { code: 'fr', name: 'France', flagUrl: 'https://f/FR.png' }, activeClub: { slug: 'fenerbahce', name: 'Fenerbahçe', pictureUrl: null },
        seasons: [season(2025, 10), season(2024, 7)],
      }));
    },
  }) as unknown as SorareClient;

  it('identité et saisons enregistrées, par lots ; rafraîchies une fois par semaine', async () => {
    const calls: string[][] = [];
    const r = await importProfiles({ sorare: fake(calls), repo }, { batchSize: 2, seasons: [2025, 2024] });
    expect(r).toEqual({ updated: 2, errors: [] });
    expect(calls).toEqual([['a', 'b'], ['c']]);
    const [a] = await sql`select birth_date::text, country_code, country_name, country_flag_url from players where sorare_slug = 'a'`;
    expect(a).toEqual({ birth_date: '1998-12-20', country_code: 'fr', country_name: 'France', country_flag_url: 'https://f/FR.png' });
    const seasons = await sql`select start_year, goals from player_seasons s join players p on p.id = s.player_id where p.sorare_slug = 'a' order by 1 desc`;
    expect(seasons).toEqual([{ start_year: 2025, goals: 10 }, { start_year: 2024, goals: 7 }]);
    const again: string[][] = [];
    await importProfiles({ sorare: fake(again), repo }, { batchSize: 2 });
    expect(again).toEqual([]); // y compris « c », inconnu de Sorare
    await sql`update players set profile_updated_at = now() - interval '8 days' where sorare_slug = 'b'`;
    await importProfiles({ sorare: fake(again), repo }, { batchSize: 2 });
    expect(again).toEqual([['b']]);
  });

  it('club actuel hors championnats suivis : seulement pour un joueur sans club suivi', async () => {
    await sql`update players set team_id = null where sorare_slug = 'a'`;
    await importProfiles({ sorare: fake([]), repo }, { batchSize: 5 });
    const rows = await sql`select p.sorare_slug, t.sorare_slug as club, t.kind from players p join teams t on t.id = p.team_id order by 1`;
    expect(rows).toEqual([
      { sorare_slug: 'a', club: 'fenerbahce', kind: 'club' },
      { sorare_slug: 'b', club: 'psg', kind: 'club' },
      { sorare_slug: 'c', club: 'psg', kind: 'club' },
    ]);
  });

  it('erreur sur un lot : signalée, les autres continuent ; temps dépassé : arrêt', async () => {
    const sorare = { playerProfiles: async (slugs: string[]) => { if (slugs.includes('a')) throw new Error('timeout'); return []; } } as unknown as SorareClient;
    const r = await importProfiles({ sorare, repo }, { batchSize: 1 });
    expect(r.errors).toEqual(['profils a : timeout']);
    const calls: string[][] = [];
    await importProfiles({ sorare: fake(calls), repo }, { deadline: Date.now() - 1 });
    expect(calls).toEqual([]);
  });
});
