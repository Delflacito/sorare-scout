import { readFileSync } from 'node:fs';
import { createSorareClient } from '@/sources/sorare';

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/sorare/${name}.json`, 'utf8'));

function fakeFetch(byQuery: [RegExp, unknown | ((variables: Record<string, unknown>) => unknown)][]) {
  const requests: { headers: Headers; body: { query: string; variables: Record<string, unknown> } }[] = [];
  const impl = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push({ headers: new Headers(init?.headers), body });
    const hit = byQuery.find(([re]) => re.test(body.query));
    const data = hit ? (typeof hit[1] === 'function' ? hit[1](body.variables) : hit[1]) : { errors: [{ message: 'unexpected' }] };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  return { impl: impl as typeof fetch, requests };
}

describe('client Sorare', () => {
  it('envoie la clé dans l’en-tête APIKEY et liste les clubs', async () => {
    const f = fakeFetch([[/teams/, fixture('clubs')]]);
    const clubs = await createSorareClient('k3y', f.impl).clubs('ligue-1-fr');
    expect(clubs).toEqual([
      { slug: 'psg', name: 'Paris Saint-Germain', shortName: 'PSG', pictureUrl: 'https://assets.sorare.com/team/psg.png', competitionSlug: 'ligue-1-fr' },
      { slug: 'om', name: 'Olympique de Marseille', shortName: 'OM', pictureUrl: null, competitionSlug: 'ligue-1-fr' },
    ]);
    expect(f.requests[0].headers.get('APIKEY')).toBe('k3y');
  });

  it('matchs d’un club : passés et à venir, compétition et statut normalisé', async () => {
    const f = fakeFetch([[/latestGames/, fixture('club-games')]]);
    const games = await createSorareClient('k', f.impl).clubGames('psg-paris');
    expect(games.map((g) => [g.id, g.competitionSlug, g.status, g.homeClubSlug, g.awayClubSlug, g.homeGoals])).toEqual([
      ['Game:aaa', 'ligue-1-fr', 'played', 'psg-paris', 'olympique-lyonnais-lyon', 2],
      ['Game:bbb', 'champions-league-europe', 'played', 'psg-paris', 'barcelona-barcelona', 1],
      ['Game:ccc', 'ligue-1-fr', 'postponed', 'lens-lens', 'psg-paris', null],
      ['Game:ddd', 'ligue-1-fr', 'scheduled', 'psg-paris', 'marseille-marseille', null],
    ]);
  });

  it('matchs d’un club : équipes (club ou sélection), nom de la compétition', async () => {
    const f = fakeFetch([[/latestGames/, fixture('club-games')]]);
    const [, ucl] = await createSorareClient('k', f.impl).clubGames('psg-paris');
    expect(ucl).toMatchObject({
      competitionSlug: 'champions-league-europe', competitionName: 'Champions League',
      home: { slug: 'psg-paris', name: 'PSG', pictureUrl: null, kind: 'club' },
      away: { slug: 'barcelona-barcelona', name: 'BARCELONA', pictureUrl: 'https://t/barca.png', kind: 'club' },
    });
  });

  it('matchs d’une sélection', async () => {
    const f = fakeFetch([[/nationalTeam/, fixture('national-games')]]);
    const [g] = await createSorareClient('k', f.impl).nationalTeamGames('france');
    expect(g).toMatchObject({
      id: 'Game:nt1', competitionSlug: 'uefa-nations-league', competitionName: 'Nations League', status: 'played',
      home: { slug: 'france', name: 'France', kind: 'national' }, away: { slug: 'belgium', kind: 'national' },
    });
    expect(f.requests[0].body.variables).toEqual({ slug: 'france' });
  });

  it('détail d’un match : compos, scores, décisif et All-Around', async () => {
    const f = fakeFetch([[/startingLineup/, fixture('game-detail')]]);
    const d = await createSorareClient('k', f.impl).gameDetail('Game:aaa');
    expect(f.requests[0].body.variables).toEqual({ id: 'aaa' });
    expect(d.home.starting.map((r) => r.length)).toEqual([1, 4, 3, 3]);
    expect(d.home.starting[1][0]).toEqual({ slug: 'achraf-hakimi', displayName: 'Achraf Hakimi' });
    expect(d.home.bench).toEqual([{ slug: 'lee-kang-in', displayName: 'Lee Kang-in' }]);
    expect(d.scores[0]).toEqual({
      playerSlug: 'desire-doue', displayName: 'Désiré Doué', position: 'Forward',
      score: 53.6, decisive: 35, allAround: 18.6, minutes: 90, started: true, actions: { goals: 1 }, formationPlace: 11,
    });
    expect(d.scores[1]).toMatchObject({ playerSlug: 'lee-kang-in', minutes: 20, started: false, decisive: 0, allAround: 0, formationPlace: null });
    expect(d.scores[2]).toMatchObject({ playerSlug: 'absent-player', minutes: 0, started: false });
  });

  it('joueurs d’un club : statut, blessure, suspension, projection et photo', async () => {
    const f = fakeFetch([[/activePlayers/, fixture('club-players')]]);
    const players = await createSorareClient('k', f.impl).clubPlayers('psg');
    expect(players).toEqual([
      { slug: 'nuno-mendes', pictureUrl: 'https://assets.sorare.com/p/nuno-sq.png', playingStatus: 'SUBSTITUTE',
        injury: { kind: 'Thigh Injury', expectedEnd: '2026-11-10' }, suspension: null, projection: 41,
        nationalTeam: { slug: 'portugal', name: 'Portugal', pictureUrl: 'https://f/PT.png' },
        position: 'Defender', cardPositions: ['Defender', 'Midfielder'] },
      { slug: 'vitinha', pictureUrl: null, playingStatus: 'STARTER',
        injury: null, suspension: { reason: 'Red card', end: '2026-11-02' }, projection: null, nationalTeam: null,
        position: 'Midfielder', cardPositions: ['Midfielder'] },
    ]);
  });

  it('profils : naissance, nationalité, saisons jouées (une requête pour plusieurs joueurs)', async () => {
    const f = fakeFetch([[/PlayerProfiles/, fixture('player-profiles')]]);
    const profiles = await createSorareClient('k', f.impl).playerProfiles(['kylian-mbappe-lottin', 'inconnu'], [2026, 2025, 2024]);
    expect(f.requests[0].body.variables).toEqual({ slugs: ['kylian-mbappe-lottin', 'inconnu'] });
    expect(f.requests[0].body.query).toContain('players(slugs: $slugs)');
    expect(f.requests[0].body.query).toContain('s2024: stats(seasonStartYear: 2024)');
    expect(profiles).toEqual([{
      slug: 'kylian-mbappe-lottin', birthDate: '1998-12-20',
      firstName: 'Kylian', lastName: 'Mbappé', height: 178, shirtNumber: 10, bodyPictureUrl: 'https://p/mbappe-trimmed.png', country: { code: 'fr', name: 'France', flagUrl: 'https://flags/FR.png' },
      activeClub: { slug: 'real-madrid-madrid', name: 'Real Madrid', pictureUrl: 'https://t/rm.png' },
      seasons: [
        { startYear: 2026, appearances: 9, substituteIn: 1, goals: 8, assists: 2, minutes: 790, yellowCards: 0, redCards: 0 },
        { startYear: 2025, appearances: 31, substituteIn: 2, goals: 25, assists: 5, minutes: 2606, yellowCards: 2, redCards: 0 },
      ],
    }]);
  });

  it('marché : taux de change, prix planchers et ventes convertis en euros', async () => {
    const sales = fixture('player-sales');
    const f = fakeFetch([[/ExchangeRates/, fixture('exchange-rates')], [/PlayerFloors/, fixture('player-floors')],
      [/PlayerSales/, (v: Record<string, unknown>) => sales[v.slug as string]]]);
    const client = createSorareClient('k', f.impl);
    const rates = await client.exchangeRates();
    expect(rates).toEqual({ usdToEur: 0.8, weiToEur: 2e-15 });
    const [m, empty] = await client.playerMarkets(['kylian-mbappe-lottin', 'no-cards', 'inconnu'], rates, 2026, 30);
    expect(f.requests[1].body.variables).toEqual({ slugs: ['kylian-mbappe-lottin', 'no-cards', 'inconnu'] });
    expect(f.requests[2].body.variables).toEqual({ slug: 'kylian-mbappe-lottin', last: 30 });
    expect(m).toEqual({
      slug: 'kylian-mbappe-lottin', floorInSeason: 184.5, floorClassic: 52.4,
      sales: [
        { date: '2026-10-27T10:00:00Z', eur: 100, seasonYear: 2026 },
        { date: '2026-10-28T18:58:42Z', eur: 170.11, seasonYear: 2026 },
        { date: '2026-10-28T19:00:00Z', eur: 50, seasonYear: 2023 },
      ],
    });
    // carte la moins chère de la saison en cours sans offre : pas de prix Classic
    expect(empty).toEqual({ slug: 'no-cards', floorInSeason: null, floorClassic: null, sales: [] });
  });

  it('erreur GraphQL → exception explicite', async () => {
    const f = fakeFetch([]);
    await expect(createSorareClient('k', f.impl).clubs('x')).rejects.toThrow(/Sorare GraphQL: unexpected/);
  });
});
