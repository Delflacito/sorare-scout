import type postgres from 'postgres';
import { describeDb, freshDb } from '../helpers/db';
import type { Repo } from '@/db/repo';
import { importFixtures } from '@/ingest/fixtures';
import type { League } from '@/ingest/leagues';
import type { SorareClient, SorareGame, SorareGameDetail, SorarePlayerScore } from '@/sources/sorare';

const league: League = { key: 'ligue1', name: 'Ligue 1', sorareSlug: 'ligue-1-fr' };

const team = (slug: string, kind: 'club' | 'national' = 'club') => ({ slug, name: slug.toUpperCase(), pictureUrl: `https://t/${slug}.png`, kind });
const game = (id: string, date: string, home: string, away: string, status: SorareGame['status'] = 'played', competitionSlug = 'ligue-1-fr', kind: 'club' | 'national' = 'club'): SorareGame =>
  ({ id, date, homeClubSlug: home, awayClubSlug: away, competitionSlug, competitionName: competitionSlug.toUpperCase(),
    home: team(home, kind), away: team(away, kind), homeGoals: 1, awayGoals: 0, status });
const pl = (slug: string) => ({ slug, displayName: slug });
const score = (playerSlug: string, position: SorarePlayerScore['position'], s: number, minutes = 90, started = true): SorarePlayerScore =>
  ({ playerSlug, displayName: playerSlug, position, score: s, decisive: 35, allAround: s - 35, minutes, started });

const G1 = game('Game:1', '2026-10-25T19:00:00Z', 'psg', 'om');
const G2 = game('Game:2', '2026-10-18T19:00:00Z', 'om', 'psg');
const CUP = game('Game:9', '2026-10-21T19:00:00Z', 'psg', 'om', 'played', 'coupe-de-france');
const NEXT = game('Game:3', '2026-11-01T20:00:00Z', 'psg', 'om', 'scheduled');
const UCL = game('Game:7', '2026-10-22T19:00:00Z', 'barcelona', 'psg', 'played', 'uefa-champions-league');
const UCL_NEXT = game('Game:8', '2026-11-05T20:00:00Z', 'psg', 'bayern', 'scheduled', 'uefa-champions-league');
const NT = game('Game:nt', '2026-10-10T18:45:00Z', 'portugal', 'spain', 'played', 'uefa-nations-league', 'national');

const DETAIL_G1: SorareGameDetail = {
  // lignes rangées de droite à gauche, comme dans Sorare
  home: { starting: [[pl('donnarumma')], [pl('hakimi'), pl('marquinhos'), pl('pacho'), pl('nuno-mendes')], [pl('neves'), pl('vitinha'), pl('ruiz')], [pl('dembele'), pl('ramos'), pl('doue')]], bench: [pl('lee')] },
  away: { starting: [[pl('rulli')], [pl('murillo'), pl('balerdi'), pl('aguerd')], [pl('weah'), pl('hojbjerg'), pl('rongier'), pl('emerson')], [pl('greenwood'), pl('aubameyang')]], bench: [] },
  scores: [
    score('nuno-mendes', 'Defender', 72), score('doue', 'Forward', 64), score('hakimi', 'Defender', 50),
    score('lee', 'Midfielder', 38, 20, false), score('greenwood', 'Forward', 55), score('emerson', 'Defender', 41),
    score('not-on-sheet', 'Forward', 0, 0, false),
  ],
};
const DETAIL_G2: SorareGameDetail = {
  home: { starting: [[pl('rulli')], [pl('murillo'), pl('balerdi'), pl('aguerd'), pl('emerson')], [pl('m1'), pl('m2'), pl('m3')], [pl('a1'), pl('a2'), pl('a3')]], bench: [] },
  away: { starting: [[pl('donnarumma')], [pl('hakimi'), pl('marquinhos'), pl('pacho'), pl('nuno-mendes')], [pl('neves'), pl('vitinha'), pl('ruiz')], [pl('dembele'), pl('ramos'), pl('doue')]], bench: [] },
  scores: [score('nuno-mendes', 'Defender', 30), score('emerson', 'Defender', 45)],
};
const EMPTY: SorareGameDetail = { home: { starting: [], bench: [] }, away: { starting: [], bench: [] }, scores: [] };

const DETAIL_UCL: SorareGameDetail = {
  home: { starting: [[pl('ter-stegen')], [pl('kounde')]], bench: [] },
  away: { starting: [[pl('donnarumma')], [pl('hakimi'), pl('nuno-mendes')]], bench: [pl('newcomer')] },
  scores: [score('ter-stegen', 'Goalkeeper', 40), score('kounde', 'Defender', 60), score('nuno-mendes', 'Defender', 66),
    score('newcomer', 'Forward', 30, 10, false)],
};
const DETAIL_NT: SorareGameDetail = {
  home: { starting: [[pl('costa')], [pl('nuno-mendes')]], bench: [pl('vitinha')] },
  away: { starting: [[pl('simon')], [pl('cucurella')]], bench: [] },
  scores: [score('costa', 'Goalkeeper', 50), score('nuno-mendes', 'Defender', 77), score('vitinha', 'Midfielder', 0, 0, false),
    score('cucurella', 'Defender', 45)],
};

function fakeSorare(opts: { details?: Record<string, SorareGameDetail | Error>; failingClub?: string; psgGames?: SorareGame[] } = {}) {
  const detailCalls: string[] = [];
  const details = opts.details ?? { 'Game:1': DETAIL_G1, 'Game:2': DETAIL_G2 };
  const sorare = {
    clubGames: async (slug: string) => {
      if (slug === opts.failingClub) throw new Error('Sorare GraphQL: club introuvable');
      return slug === 'psg' ? (opts.psgGames ?? [G1, G2, NEXT]) : [G1, G2];
    },
    nationalTeamGames: async (slug: string) => (slug === 'portugal' ? [NT] : []),
    gameDetail: async (id: string) => {
      detailCalls.push(id);
      const d = details[id] ?? EMPTY;
      if (d instanceof Error) throw d;
      return d;
    },
  } as unknown as SorareClient;
  return { sorare, detailCalls };
}

describeDb('importFixtures', () => {
  let sql: postgres.Sql;
  let repo: Repo;
  beforeEach(async () => {
    ({ sql, repo } = await freshDb());
    const competitionId = await repo.upsertCompetition({ slug: 'ligue-1-fr', name: 'Ligue 1' });
    await repo.upsertTeam({ name: 'PSG', sorareSlug: 'psg', competitionId });
    await repo.upsertTeam({ name: 'OM', sorareSlug: 'om', competitionId });
  });
  afterEach(() => sql.end());

  const appearances = () => sql`
    select p.sorare_slug, f.sorare_game_id, t.sorare_slug as team, a.detailed_position, a.started, a.minutes, a.sorare_score
    from appearances a join players p on p.id = a.player_id join fixtures f on f.id = a.fixture_id join teams t on t.id = a.team_id
    order by f.sorare_game_id, p.sorare_slug`;

  it('importe compos, postes précis et scores depuis Sorare', async () => {
    const r = await importFixtures({ ...fakeSorare(), repo }, [league]);
    expect(r).toEqual({ fixturesImported: 2, errors: [] });
    const rows = await appearances();
    const row = (slug: string, gameId: string) => rows.find((x) => x.sorare_slug === slug && x.sorare_game_id === gameId);
    expect(row('nuno-mendes', 'Game:1')).toMatchObject({ team: 'psg', detailed_position: 'LB', started: true, sorare_score: 72 });
    expect(row('hakimi', 'Game:1')).toMatchObject({ detailed_position: 'RB' });
    expect(row('doue', 'Game:1')).toMatchObject({ detailed_position: 'LW' });
    expect(row('greenwood', 'Game:1')).toMatchObject({ team: 'om', detailed_position: 'ST' });
    expect(row('emerson', 'Game:1')).toMatchObject({ team: 'om', detailed_position: 'LWB' });
    expect(row('lee', 'Game:1')).toMatchObject({ team: 'psg', detailed_position: null, started: false, minutes: 20 });
    expect(row('not-on-sheet', 'Game:1')).toBeUndefined();
    expect(row('emerson', 'Game:2')).toMatchObject({ team: 'om', detailed_position: 'LB' });
    const [f] = await sql`select home_formation, away_formation from fixtures where sorare_game_id = 'Game:1'`;
    expect(f).toEqual({ home_formation: '4-3-3', away_formation: '3-4-2' });
  });

  it('matchs de coupe joués importés dans leur compétition (hors championnat), matchs à venir du championnat gardés', async () => {
    await importFixtures({ ...fakeSorare({ psgGames: [G1, G2, CUP, NEXT] }), repo }, [league]);
    const games = await sql`select f.sorare_game_id, f.status, c.slug, c.is_league from fixtures f join competitions c on c.id = f.competition_id
      order by f.sorare_game_id`;
    expect(games).toEqual([
      { sorare_game_id: 'Game:1', status: 'played', slug: 'ligue-1-fr', is_league: true },
      { sorare_game_id: 'Game:2', status: 'played', slug: 'ligue-1-fr', is_league: true },
      { sorare_game_id: 'Game:3', status: 'scheduled', slug: 'ligue-1-fr', is_league: true },
      { sorare_game_id: 'Game:9', status: 'played', slug: 'coupe-de-france', is_league: false },
    ]);
  });

  it('Ligue des champions : adversaire créé, joueurs du club suivi importés, ceux de l’adversaire ignorés', async () => {
    const f = fakeSorare({ psgGames: [G1, UCL, UCL_NEXT], details: { 'Game:1': DETAIL_G1, 'Game:7': DETAIL_UCL } });
    const r = await importFixtures({ ...f, repo }, [league]);
    expect(r.errors).toEqual([]);
    const games = await sql`select sorare_game_id from fixtures order by 1`;
    expect(games.map((g) => g.sorare_game_id)).toEqual(['Game:1', 'Game:2', 'Game:7']); // match européen à venir non enregistré
    const [barca] = await sql`select name, picture_url, kind, competition_id from teams where sorare_slug = 'barcelona'`;
    expect(barca).toEqual({ name: 'BARCELONA', picture_url: 'https://t/barcelona.png', kind: 'club', competition_id: null });
    const ucl = (await appearances()).filter((a) => a.sorare_game_id === 'Game:7');
    expect(ucl.map((a) => [a.sorare_slug, a.team])).toEqual([['newcomer', 'psg'], ['nuno-mendes', 'psg']]);
    const [psg] = await sql`select competition_id from teams where sorare_slug = 'psg'`;
    expect(psg.competition_id).not.toBeNull();
  });

  it('sélections : matchs des sélections des joueurs connus, seuls ces joueurs sont importés, club inchangé', async () => {
    await importFixtures({ ...fakeSorare(), repo }, [league]);
    const portugal = await repo.ensureTeam({ name: 'Portugal', sorareSlug: 'portugal', pictureUrl: null, kind: 'national' });
    await repo.updatePlayerStatuses([{ slug: 'nuno-mendes', pictureUrl: null, playingStatus: null, injury: null, suspension: null, projection: null, nationalTeamId: portugal }]);
    const r = await importFixtures({ ...fakeSorare({ details: { 'Game:nt': DETAIL_NT } }), repo }, [league]);
    expect(r).toEqual({ fixturesImported: 1, errors: [] });
    const nt = (await appearances()).filter((a) => a.sorare_game_id === 'Game:nt');
    expect(nt.map((a) => [a.sorare_slug, a.team, a.sorare_score])).toEqual([['nuno-mendes', 'portugal', 77]]);
    const [nuno] = await sql`select t.sorare_slug from players p join teams t on t.id = p.team_id where p.sorare_slug = 'nuno-mendes'`;
    expect(nuno.sorare_slug).toBe('psg');
    const [spain] = await sql`select kind from teams where sorare_slug = 'spain'`;
    expect(spain.kind).toBe('national');
  });

  it('relance : aucun doublon, aucun match redemandé', async () => {
    await importFixtures({ ...fakeSorare(), repo }, [league]);
    const f = fakeSorare();
    const r = await importFixtures({ ...f, repo }, [league]);
    expect(f.detailCalls).toEqual([]);
    expect(r.fixturesImported).toBe(0);
    const [{ count }] = await sql`select count(*)::int as count from appearances`;
    expect(count).toBe(8);
  });

  it('compo pas encore publiée : en attente, abandon après 5 tentatives', async () => {
    const details = { 'Game:1': DETAIL_G1 };
    const r = await importFixtures({ ...fakeSorare({ details }), repo }, [league]);
    expect(r.fixturesImported).toBe(1);
    for (let i = 0; i < 4; i++) await importFixtures({ ...fakeSorare({ details }), repo }, [league]);
    const f = fakeSorare({ details });
    await importFixtures({ ...f, repo }, [league]);
    expect(f.detailCalls).toEqual([]);
  });

  it('erreur sur un club : signalée, le reste est importé', async () => {
    const r = await importFixtures({ ...fakeSorare({ failingClub: 'om' }), repo }, [league]);
    expect(r.errors).toContain('club om : Sorare GraphQL: club introuvable');
    expect(r.fixturesImported).toBe(2);
  });

  it('erreur sur un match : signalée, les autres continuent', async () => {
    const r = await importFixtures({ ...fakeSorare({ details: { 'Game:1': new Error('timeout'), 'Game:2': DETAIL_G2 } }), repo }, [league]);
    expect(r.errors).toEqual(['match Game:1 : timeout']);
    expect(r.fixturesImported).toBe(1);
  });

  it('budget de temps dépassé : aucun nouveau match complété, les matchs sont tout de même enregistrés', async () => {
    const f = fakeSorare();
    const r = await importFixtures({ ...f, repo }, [league], { deadline: Date.now() - 1 });
    expect(f.detailCalls).toEqual([]);
    expect(r.fixturesImported).toBe(0);
    const [{ count }] = await sql`select count(*)::int as count from fixtures`;
    expect(count).toBe(3);
  });

  it('les matchs les plus récents sont complétés en premier', async () => {
    const f = fakeSorare();
    await importFixtures({ ...f, repo }, [league]);
    expect(f.detailCalls).toEqual(['Game:1', 'Game:2']);
  });

  it('saison en cours uniquement : matchs antérieurs ignorés et anciens matchs supprimés', async () => {
    const competitionId = (await sql`select id from competitions`)[0].id;
    const [psg, om] = (await sql`select id from teams order by sorare_slug desc`).map((r) => r.id);
    await repo.upsertFixture({ date: '2026-05-01T19:00:00Z', competitionId, homeTeamId: psg, awayTeamId: om, homeGoals: 0, awayGoals: 0, status: 'played', sorareGameId: 'Game:old' });
    const f = fakeSorare();
    await importFixtures({ ...f, repo }, [league], { since: '2026-10-20T00:00:00.000Z' });
    const games = await sql`select sorare_game_id from fixtures order by 1`;
    expect(games.map((g) => g.sorare_game_id)).toEqual(['Game:1', 'Game:3']);
    expect(f.detailCalls).toEqual(['Game:1']);
  });

  it('complète plusieurs matchs en parallèle', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const f = fakeSorare();
    const sorare = {
      ...f.sorare,
      gameDetail: async (id: string) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return f.sorare.gameDetail(id);
      },
    } as unknown as SorareClient;
    const r = await importFixtures({ sorare, repo }, [league], { concurrency: 4 });
    expect(r.fixturesImported).toBe(2);
    expect(maxInFlight).toBe(2);
  });
});
