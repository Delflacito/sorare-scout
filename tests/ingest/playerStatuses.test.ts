import type postgres from 'postgres';
import { describeDb, freshDb } from '../helpers/db';
import type { Repo } from '@/db/repo';
import { importPlayerStatuses } from '@/ingest/playerStatuses';
import type { League } from '@/ingest/leagues';
import type { SorareClient, SorarePlayerStatus } from '@/sources/sorare';

const league: League = { key: 'ligue1', name: 'Ligue 1', sorareSlug: 'ligue-1-fr' };
const status = (slug: string, s: Partial<SorarePlayerStatus> = {}): SorarePlayerStatus =>
  ({ slug, pictureUrl: null, playingStatus: 'STARTER', injury: null, suspension: null, projection: null, nationalTeam: null, ...s });

describeDb('importPlayerStatuses', () => {
  let sql: postgres.Sql;
  let repo: Repo;
  beforeEach(async () => {
    ({ sql, repo } = await freshDb());
    const competitionId = await repo.upsertCompetition({ slug: 'ligue-1-fr', name: 'Ligue 1' });
    const psg = await repo.upsertTeam({ name: 'PSG', sorareSlug: 'psg', competitionId });
    await repo.upsertTeam({ name: 'OM', sorareSlug: 'om', competitionId });
    await repo.upsertPlayer({ name: 'Nuno Mendes', sorareSlug: 'nuno-mendes', position: 'Defender', teamId: psg });
    await repo.upsertPlayer({ name: 'Vitinha', sorareSlug: 'vitinha', position: 'Midfielder', teamId: psg });
  });
  afterEach(() => sql.end());

  it('met à jour statut, blessure, suspension, projection et photo des joueurs connus', async () => {
    const sorare = {
      clubPlayers: async (slug: string) => slug === 'psg' ? [
        status('nuno-mendes', { pictureUrl: 'https://p/nuno.png', playingStatus: 'SUBSTITUTE', injury: { kind: 'Thigh Injury', expectedEnd: '2026-11-10' }, projection: 41 }),
        status('vitinha', { suspension: { reason: 'Red card', end: '2026-11-02' } }),
        status('inconnu'),
      ] : [],
    } as unknown as SorareClient;
    const r = await importPlayerStatuses({ sorare, repo }, [league]);
    expect(r).toEqual({ updated: 2, errors: [] });
    const rows = await sql`select sorare_slug, picture_url, playing_status, injury_kind, injury_end::text, suspension_reason, suspension_end::text, sorare_projection
      from players order by 1`;
    expect(rows).toEqual([
      { sorare_slug: 'nuno-mendes', picture_url: 'https://p/nuno.png', playing_status: 'SUBSTITUTE', injury_kind: 'Thigh Injury', injury_end: '2026-11-10',
        suspension_reason: null, suspension_end: null, sorare_projection: 41 },
      { sorare_slug: 'vitinha', picture_url: null, playing_status: 'STARTER', injury_kind: null, injury_end: null,
        suspension_reason: 'Red card', suspension_end: '2026-11-02', sorare_projection: null },
    ]);
  });

  it('sélection nationale : créée et rattachée au joueur', async () => {
    const portugal = { slug: 'portugal', name: 'Portugal', pictureUrl: 'https://f/PT.png' };
    const sorare = { clubPlayers: async (s: string) => (s === 'psg' ? [status('nuno-mendes', { nationalTeam: portugal }), status('vitinha', { nationalTeam: portugal })] : []) } as unknown as SorareClient;
    await importPlayerStatuses({ sorare, repo }, [league]);
    const rows = await sql`select p.sorare_slug, t.sorare_slug as nt, t.kind, t.picture_url, t.competition_id from players p join teams t on t.id = p.national_team_id order by 1`;
    expect(rows).toEqual([
      { sorare_slug: 'nuno-mendes', nt: 'portugal', kind: 'national', picture_url: 'https://f/PT.png', competition_id: null },
      { sorare_slug: 'vitinha', nt: 'portugal', kind: 'national', picture_url: 'https://f/PT.png', competition_id: null },
    ]);
    expect((await repo.nationalTeamsOfPlayers()).map((t) => t.sorareSlug)).toEqual(['portugal']);
  });

  it('blessure guérie : effacée au prochain import', async () => {
    const injured = { clubPlayers: async (s: string) => (s === 'psg' ? [status('nuno-mendes', { injury: { kind: 'Thigh Injury', expectedEnd: null } })] : []) } as unknown as SorareClient;
    const healed = { clubPlayers: async (s: string) => (s === 'psg' ? [status('nuno-mendes')] : []) } as unknown as SorareClient;
    await importPlayerStatuses({ sorare: injured, repo }, [league]);
    await importPlayerStatuses({ sorare: healed, repo }, [league]);
    const [p] = await sql`select injury_kind from players where sorare_slug = 'nuno-mendes'`;
    expect(p.injury_kind).toBeNull();
  });

  it('erreur sur un club : signalée, les autres continuent', async () => {
    const sorare = { clubPlayers: async (s: string) => { if (s === 'om') throw new Error('timeout'); return [status('vitinha')]; } } as unknown as SorareClient;
    const r = await importPlayerStatuses({ sorare, repo }, [league]);
    expect(r).toEqual({ updated: 1, errors: ['statuts om : timeout'] });
  });

  it('clubs : logo et nom court enregistrés', async () => {
    await repo.upsertTeam({ name: 'PSG', sorareSlug: 'psg', competitionId: (await sql`select id from competitions`)[0].id, pictureUrl: 'https://t/psg.png', shortName: 'PSG' });
    const [t] = await sql`select picture_url, short_name from teams where sorare_slug = 'psg'`;
    expect(t).toEqual({ picture_url: 'https://t/psg.png', short_name: 'PSG' });
  });
});
